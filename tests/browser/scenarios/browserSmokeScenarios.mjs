import { readFile } from 'node:fs/promises';

import {
  buildJsonlResultStream,
  cleanupMobilePageScroll,
  dragTouchLocator,
  encodeFormSpecForUrl,
  expectDarkInput,
  expectElementWithinViewport,
  exerciseMobileToastQueue,
  expectMinimumTapTarget,
  expectMobileEditableFocusContained,
  expectMobileHeaderDragDoesNotOpenContextMenu,
  expectMobileScrollLockReleased,
  expectMobileTableContextMenu,
  expectMobileViewportStability,
  expectNoHorizontalOverflow,
  expectOverlayConsumesScroll,
  expectResponsiveShellMode,
  expectSplitTogglePreviewAnimation,
  expectSplitTogglePreferenceWithoutEligibleResults,
  expectVisibleMobileTableContextMenu,
  installHiddenTabNotificationSpy,
  longPressLocatorWithDomTouchEvents,
  openDesktopTableContextMenu,
  openExportOverlayPromptly,
  openMobilePanel,
  primeMobilePageScroll,
  queueHistoryStatusResponses,
  readResponsiveShellMetrics,
  restoreVisibleTabNotificationSpy,
  seedLargeExportResults,
  seedLoadedResults,
  seedWideDragResults,
  smokeResultHeaders,
  waitForAppReady,
  waitForExportOptionsReady,
  waitForGroupedExportAvailable,
  waitForResponsiveResize
} from '../support/browserSmokeSupport.mjs';

const XML_ENTITIES = new Map([
  ['amp', '&'],
  ['apos', "'"],
  ['gt', '>'],
  ['lt', '<'],
  ['quot', '"']
]);
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;

function decodeXmlEntities(value = '') {
  return String(value).replace(/&([^;]+);/gu, (match, entity) => XML_ENTITIES.get(entity) || match);
}

function getColumnName(index) {
  let current = index;
  let name = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function findEndOfCentralDirectory(view) {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  return -1;
}

function readWorkbookZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const endOffset = findEndOfCentralDirectory(view);
  if (endOffset === -1) return new Map();

  const entryCount = view.getUint16(endOffset + 10, true);
  let centralOffset = view.getUint32(endOffset + 16, true);
  const entries = new Map();

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (view.getUint32(centralOffset, true) !== ZIP_CENTRAL_FILE_HEADER) {
      break;
    }
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const nameStart = centralOffset + 46;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));

    if (view.getUint32(localOffset, true) === ZIP_LOCAL_FILE_HEADER) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      entries.set(name, decoder.decode(bytes.slice(dataStart, dataEnd)));
    }

    centralOffset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function extractZipEntryText(workbookEntries, path) {
  return workbookEntries.get(path) || '';
}

function getWorkbookSheetId(workbookEntries, sheetName) {
  const workbookXml = extractZipEntryText(workbookEntries, 'xl/workbook.xml');
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*sheetId="(\d+)"/gu)) {
    if (decodeXmlEntities(match[1]) === sheetName) {
      return Number(match[2]);
    }
  }
  return 0;
}

function getTableColumns(tableXml) {
  return [...tableXml.matchAll(/<tableColumn\b[^>]*name="([^"]*)"/gu)]
    .map(match => decodeXmlEntities(match[1]));
}

function parseSheetRows(sheetXml) {
  return [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gu)]
    .slice(1)
    .map(rowMatch => [...rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)].map(cellMatch => {
      const cellBody = cellMatch[2];
      const textMatch = cellBody.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/u);
      if (textMatch) return decodeXmlEntities(textMatch[1]);
      const valueMatch = cellBody.match(/<v>([\s\S]*?)<\/v>/u);
      if (!valueMatch) return '';
      const numericValue = Number(valueMatch[1]);
      return Number.isFinite(numericValue) ? numericValue : valueMatch[1];
    }));
}

function getStyleXml(stylesXml, styleId) {
  const cellXfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/u)?.[1] || '';
  return [...cellXfs.matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/gu)][Number(styleId)]?.[0] || '';
}

function getCellStyleId(sheetXml, cellReference) {
  const escapedReference = cellReference.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = sheetXml.match(new RegExp(`<c\\b[^>]*r="${escapedReference}"[^>]*s="([^"]+)"`, 'u'));
  return match?.[1] || '';
}

async function readWorkbookDownloadEntries(download) {
  if (!download) return new Map();
  const downloadPath = await download.path();
  if (!downloadPath) return new Map();
  const workbookBytes = await readFile(downloadPath);
  return readWorkbookZipEntries(workbookBytes);
}

async function exerciseLiveResponsiveResize(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await waitForResponsiveResize(page, false);
  await seedLoadedResults(page, { rowCount: 24 });
  await expectResponsiveShellMode(page, 'desktop', 'Live resize desktop baseline');
  await expectNoHorizontalOverflow(page, 'Live resize desktop baseline');

  await page.setViewportSize({ width: 1024, height: 768 });
  await waitForResponsiveResize(page, true);
  await expectResponsiveShellMode(page, 'mobile', 'Live resize desktop-to-tablet-landscape');
  await expectNoHorizontalOverflow(page, 'Live resize desktop-to-tablet-landscape');

  await page.setViewportSize({ width: 1180, height: 820 });
  await waitForResponsiveResize(page, true);
  await expectResponsiveShellMode(page, 'mobile', 'Live resize large-tablet-landscape');
  await expectNoHorizontalOverflow(page, 'Live resize large-tablet-landscape');

  await page.setViewportSize({ width: 844, height: 390 });
  await waitForResponsiveResize(page, true);
  await expectResponsiveShellMode(page, 'mobile', 'Live resize phone landscape');
  await expectNoHorizontalOverflow(page, 'Live resize phone landscape');

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForResponsiveResize(page, true);
  await expectResponsiveShellMode(page, 'mobile', 'Live resize desktop-to-mobile');
  await expectNoHorizontalOverflow(page, 'Live resize desktop-to-mobile');

  await page.locator('#mobile-builder-toggle').click();
  await page.waitForFunction(() => {
    return document.querySelector('#mobile-builder-drawer')?.classList.contains('is-open');
  }, null, { timeout: 5000 });

  await page.locator('[data-mobile-table-action="fields-panel"]').click();
  await page.waitForFunction(() => document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });

  await page.setViewportSize({ width: 1181, height: 820 });
  await waitForResponsiveResize(page, false);
  await expectResponsiveShellMode(page, 'desktop', 'Live resize mobile-to-desktop closes mobile-only surfaces');
  await expectNoHorizontalOverflow(page, 'Live resize mobile-to-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForResponsiveResize(page, true);
  await page.locator('#mobile-menu-toggle').click();
  await page.locator('#mobile-menu-dropdown.show').waitFor({ state: 'visible', timeout: 5000 });
  await page.setViewportSize({ width: 1181, height: 820 });
  await waitForResponsiveResize(page, false);
  await page.locator('#mobile-menu-dropdown.hidden').waitFor({ state: 'attached', timeout: 5000 });
  const menuResizeMetrics = await readResponsiveShellMetrics(page);
  if (menuResizeMetrics.mobileMenuOpen || menuResizeMetrics.bodyModalPanelOpen) {
    throw new Error(`Live resize to desktop should close the mobile menu: ${JSON.stringify(menuResizeMetrics)}`);
  }

  await page.locator('#table-expand-btn').click();
  await page.waitForFunction(() => document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForResponsiveResize(page, true);
  const expandedMobileMetrics = await readResponsiveShellMetrics(page);
  if (!expandedMobileMetrics.isExpanded || expandedMobileMetrics.tableZoom !== '0.90') {
    throw new Error(`Expanded table should compact when live-resized to mobile: ${JSON.stringify(expandedMobileMetrics)}`);
  }
  await expectElementWithinViewport(page, '#table-shell.table-shell-expanded', 'Live-resized expanded mobile table');

  await page.setViewportSize({ width: 1280, height: 900 });
  await waitForResponsiveResize(page, false);
  const expandedDesktopMetrics = await readResponsiveShellMetrics(page);
  if (!expandedDesktopMetrics.isExpanded || expandedDesktopMetrics.tableZoom !== '1.00') {
    throw new Error(`Expanded table should restore desktop zoom when live-resized back: ${JSON.stringify(expandedDesktopMetrics)}`);
  }
  await expectElementWithinViewport(page, '#table-shell.table-shell-expanded', 'Live-resized expanded desktop table');
  await page.locator('#table-expand-btn').click();
  await page.waitForFunction(() => !document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });

  await page.setViewportSize({ width: 820, height: 1180 });
  await waitForResponsiveResize(page, true);
  await primeMobilePageScroll(page);
  await page.locator('[data-mobile-table-action="fields-panel"]').click();
  await page.waitForFunction(() => document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
  await page.setViewportSize({ width: 1180, height: 820 });
  await waitForResponsiveResize(page, true);
  await expectElementWithinViewport(page, '#filter-side-panel', 'Live-rotated tablet display and filters sheet');
  await expectOverlayConsumesScroll(page, '#filter-panel-body .fp-display-section', 'Live-rotated tablet display and filters sheet');
  const rotatedFilterMetrics = await page.locator('#filter-side-panel').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const body = document.querySelector('#filter-panel-body');
    const bodyStyle = body ? window.getComputedStyle(body) : null;
    return {
      bodyColumns: bodyStyle ? bodyStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      bodyLocked: document.body.classList.contains('mobile-overlay-scroll-locked'),
      bottomGap: Math.abs(window.innerHeight - rect.bottom),
      top: rect.top,
      width: rect.width
    };
  });
  if (
    !rotatedFilterMetrics.bodyLocked
    || rotatedFilterMetrics.bodyColumns !== 2
    || rotatedFilterMetrics.width < 900
    || rotatedFilterMetrics.top < 48
    || rotatedFilterMetrics.bottomGap > 24
  ) {
    throw new Error(`Display and filters should remain usable while rotating tablet portrait-to-landscape: ${JSON.stringify(rotatedFilterMetrics)}`);
  }
  await page.locator('#filter-panel-mobile-close').click();
  await page.waitForFunction(() => !document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
  await expectMobileScrollLockReleased(page, 'Live-rotated tablet display and filters sheet');
  await cleanupMobilePageScroll(page);

  await page.setViewportSize({ width: 820, height: 1180 });
  await waitForResponsiveResize(page, true);
  await primeMobilePageScroll(page);
  await page.locator('[data-mobile-table-action-target="table-add-field-btn"]').click();
  await page.locator('.form-mode-field-picker-modal:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  await page.setViewportSize({ width: 1180, height: 820 });
  await waitForResponsiveResize(page, true);
  await expectElementWithinViewport(page, '.form-mode-field-picker-modal:not(.hidden)', 'Live-rotated tablet add field dialog');
  const rotatedAddFieldMetrics = await page.locator('.form-mode-field-picker-modal:not(.hidden)').evaluate(modal => {
    const body = modal.querySelector('.form-mode-field-picker-body');
    const bodyStyle = body ? window.getComputedStyle(body) : null;
    const rect = modal.getBoundingClientRect();
    return {
      bodyColumns: bodyStyle ? bodyStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      bodyLocked: document.body.classList.contains('mobile-overlay-scroll-locked'),
      bottomGap: Math.abs(window.innerHeight - rect.bottom),
      sideGapDelta: Math.abs(rect.left - Math.abs(window.innerWidth - rect.right)),
      top: rect.top,
      width: rect.width
    };
  });
  if (
    !rotatedAddFieldMetrics.bodyLocked
    || rotatedAddFieldMetrics.bodyColumns !== 2
    || rotatedAddFieldMetrics.width < 900
    || rotatedAddFieldMetrics.sideGapDelta > 2
    || rotatedAddFieldMetrics.top > 16
    || rotatedAddFieldMetrics.bottomGap > 16
  ) {
    throw new Error(`Add field dialog should remain centered and usable while rotating tablet portrait-to-landscape: ${JSON.stringify(rotatedAddFieldMetrics)}`);
  }
  await page.locator('.form-mode-field-picker-close').click();
  await expectMobileScrollLockReleased(page, 'Live-rotated tablet add field dialog');
  await cleanupMobilePageScroll(page);

  await page.setViewportSize({ width: 1280, height: 720 });
  await waitForResponsiveResize(page, false);
}

async function exerciseTabletLandscapeMobileParity(page, queryApiStub) {
  await page.setViewportSize({ width: 1180, height: 820 });
  await waitForResponsiveResize(page, true);
  await expectMobileViewportStability(page);
  await expectNoHorizontalOverflow(page, 'Tablet landscape initial layout');
  const initialShellMetrics = await readResponsiveShellMetrics(page);
  if (
    !initialShellMetrics.isMobile
    || initialShellMetrics.headerControlsDisplay !== 'none'
    || initialShellMetrics.mobileMenuDisplay === 'none'
    || initialShellMetrics.tableZoom !== '0.84'
  ) {
    throw new Error(`Tablet landscape should start in the mobile shell even before results load: ${JSON.stringify(initialShellMetrics)}`);
  }
  await exerciseMobileToastQueue(page);

  await page.locator('#mobile-menu-toggle').click();
  await page.locator('#mobile-menu-dropdown.show').waitFor({ state: 'visible', timeout: 5000 });
  await expectMinimumTapTarget(page, '#mobile-menu-dropdown .mobile-menu-item', 'Tablet landscape mobile menu items');
  const menuMetrics = await page.locator('#mobile-menu-dropdown.show').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const items = document.querySelector('#mobile-menu-items');
    const itemsStyle = items ? window.getComputedStyle(items) : null;
    return {
      bottomGap: Math.abs(window.innerHeight - rect.bottom),
      columns: itemsStyle ? itemsStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      height: rect.height,
      left: rect.left,
      position: window.getComputedStyle(element).position,
      rightGap: Math.abs(window.innerWidth - rect.right),
      sideGapDelta: Math.abs(rect.left - Math.abs(window.innerWidth - rect.right)),
      viewportHeight: window.innerHeight,
      width: rect.width
    };
  });
  if (
    menuMetrics.position !== 'fixed'
    || menuMetrics.bottomGap > 1
    || menuMetrics.columns !== 3
    || menuMetrics.sideGapDelta > 2
    || menuMetrics.width < 320
    || menuMetrics.height > menuMetrics.viewportHeight * 0.86
  ) {
    throw new Error(`Tablet landscape should keep the mobile menu reachable as a sheet: ${JSON.stringify(menuMetrics)}`);
  }

  queueHistoryStatusResponses(queryApiStub);
  await page.locator('[data-source-control-id="toggle-queries"]').click();
  await page.locator('#queries-search').waitFor({ state: 'visible', timeout: 5000 });
  await expectElementWithinViewport(page, '#queries-panel', 'Tablet landscape query history panel');
  await expectDarkInput(page, '#queries-search', 'Tablet landscape query history search input');
  await page.waitForFunction(() => {
    return document.querySelector('[data-history-book="complete"] .history-book-count')?.textContent?.trim() === '1'
      && document.querySelector('[data-history-book="running"] .history-book-count')?.textContent?.trim() === '1';
  }, null, { timeout: 5000 });
  const historyMetrics = await page.locator('.history-bookshelf').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const books = Array.from(element.querySelectorAll('[data-history-book]')).map(book => {
      const bookRect = book.getBoundingClientRect();
      return {
        height: bookRect.height,
        width: bookRect.width
      };
    }).filter(book => book.width > 0 && book.height > 0);
    return {
      bookCount: books.length,
      columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
      height: rect.height,
      maxBookHeight: Math.max(...books.map(book => book.height)),
      viewportHeight: window.innerHeight
    };
  });
  if (
    historyMetrics.bookCount !== 4
    || historyMetrics.columns !== 4
    || historyMetrics.height > 100
    || historyMetrics.maxBookHeight > 110
  ) {
    throw new Error(`Tablet landscape history should preserve the compact mobile picker: ${JSON.stringify(historyMetrics)}`);
  }
  await page.locator('[data-history-book="complete"] .history-book-summary').click();
  await page.locator('.history-monitor').waitFor({ state: 'visible', timeout: 5000 });
  await expectElementWithinViewport(page, '.history-monitor', 'Tablet landscape query history monitor');
  await expectMinimumTapTarget(page, '.history-monitor-close, .history-monitor-tab, .history-monitor .history-expand-btn, .history-monitor .load-query-btn, .history-monitor .rerun-query-btn, .history-monitor .template-query-btn', 'Tablet landscape history monitor controls');
  const historyMonitorMetrics = await page.locator('.history-monitor').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const tabs = element.querySelector('.history-monitor-tabs');
    const tabsStyle = tabs ? window.getComputedStyle(tabs) : null;
    const stageRect = element.querySelector('.history-monitor-stage')?.getBoundingClientRect();
    const firstRow = element.querySelector('.history-row');
    const rowStyle = firstRow ? window.getComputedStyle(firstRow) : null;
    const firstCellRect = firstRow?.querySelector('td:first-child')?.getBoundingClientRect();
    return {
      bottomGap: window.innerHeight - rect.bottom,
      firstCellWidth: firstCellRect?.width || 0,
      left: rect.left,
      rowColumns: rowStyle ? rowStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      sideGapDelta: Math.abs(rect.left - Math.abs(window.innerWidth - rect.right)),
      stageHeight: stageRect?.height || 0,
      tabColumns: tabsStyle ? tabsStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      viewportHeight: window.innerHeight,
      width: rect.width
    };
  });
  if (
    historyMonitorMetrics.tabColumns !== 4
    || historyMonitorMetrics.rowColumns < 4
    || historyMonitorMetrics.firstCellWidth < 240
    || historyMonitorMetrics.stageHeight < historyMonitorMetrics.viewportHeight * 0.45
    || historyMonitorMetrics.sideGapDelta > 2
    || historyMonitorMetrics.bottomGap < 0
    || historyMonitorMetrics.width < 680
  ) {
    throw new Error(`Tablet landscape history monitor should use a centered tablet sheet with compact rows: ${JSON.stringify(historyMonitorMetrics)}`);
  }
  await page.locator('.history-monitor .history-expand-btn').first().click();
  await page.locator('.history-details-modal').waitFor({ state: 'visible', timeout: 5000 });
  await expectElementWithinViewport(page, '.history-details-modal', 'Tablet landscape history details modal');
  await expectMinimumTapTarget(page, '.history-details-modal-close', 'Tablet landscape history details close button');
  const tabletHistoryDetailsMetrics = await page.locator('.history-details-modal').evaluate(modal => {
    const rect = modal.getBoundingClientRect();
    const grid = modal.querySelector('.history-details-grid');
    const gridStyle = grid ? window.getComputedStyle(grid) : null;
    modal.scrollTop = 0;
    const filler = document.createElement('div');
    filler.dataset.browserSmokeHistoryDetailsFiller = 'true';
    filler.style.height = '900px';
    filler.style.pointerEvents = 'none';
    modal.appendChild(filler);
    modal.scrollTop = 240;
    const scrollTop = modal.scrollTop;
    filler.remove();
    modal.scrollTop = 0;
    return {
      bottomGap: Math.abs(window.innerHeight - rect.bottom),
      gridColumns: gridStyle ? gridStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      height: rect.height,
      scrollTop,
      sideGapDelta: Math.abs(rect.left - Math.abs(window.innerWidth - rect.right)),
      top: rect.top,
      width: rect.width
    };
  });
  if (
    tabletHistoryDetailsMetrics.gridColumns !== 2
    || tabletHistoryDetailsMetrics.width < 680
    || tabletHistoryDetailsMetrics.sideGapDelta > 2
    || tabletHistoryDetailsMetrics.top < 60
    || tabletHistoryDetailsMetrics.bottomGap < 0
    || tabletHistoryDetailsMetrics.scrollTop < 120
  ) {
    throw new Error(`Tablet landscape history details should use a centered scrollable tablet modal: ${JSON.stringify(tabletHistoryDetailsMetrics)}`);
  }
  await page.locator('.history-details-modal-close').click();
  await page.locator('.history-details-modal-shell').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('.history-monitor-close').click();
  await page.locator('.history-monitor').waitFor({ state: 'detached', timeout: 5000 });
  await page.locator('#queries-panel .collapse-btn').click();
  await page.locator('#queries-panel.hidden').waitFor({ state: 'attached', timeout: 5000 });

  await primeMobilePageScroll(page);
  await openMobilePanel(page, 'toggle-json', '#query-json-tree');
  await expectElementWithinViewport(page, '#json-panel', 'Tablet landscape JSON panel');
  await expectOverlayConsumesScroll(page, '#query-json-tree', 'Tablet landscape JSON panel');
  const jsonMetrics = await page.locator('#json-editor-shell').evaluate(shell => {
    const rect = shell.getBoundingClientRect();
    const tree = document.querySelector('#query-json-tree');
    const treeStyle = tree ? window.getComputedStyle(tree) : null;
    return {
      bottomGap: Math.abs(window.innerHeight - rect.bottom),
      fontSize: treeStyle ? Number.parseFloat(treeStyle.fontSize || '0') : 0,
      height: rect.height,
      width: rect.width
    };
  });
  if (
    jsonMetrics.bottomGap > 2
    || jsonMetrics.fontSize < 12
    || jsonMetrics.height < 600
    || jsonMetrics.width < 900
  ) {
    throw new Error(`Tablet landscape JSON panel should keep a dense scroll-contained editor: ${JSON.stringify(jsonMetrics)}`);
  }
  await page.locator('#json-panel .collapse-btn').click();
  await page.locator('#json-panel.hidden').waitFor({ state: 'attached', timeout: 5000 });
  await expectMobileScrollLockReleased(page, 'Tablet landscape JSON panel');

  await openMobilePanel(page, 'toggle-help', '#help-container');
  await expectElementWithinViewport(page, '#help-panel', 'Tablet landscape help panel');
  await expectOverlayConsumesScroll(page, '.help-shell', 'Tablet landscape help panel');
  const helpMetrics = await page.locator('#help-container').evaluate(container => {
    const shell = container.querySelector('.help-shell');
    const hero = container.querySelector('.help-hero');
    const cardGrid = container.querySelector('.help-card-grid');
    const actionsGrid = container.querySelector('.help-actions-grid');
    const tipGrid = container.querySelector('.help-tip-grid');
    const shellRect = shell?.getBoundingClientRect();
    const shellStyle = shell ? window.getComputedStyle(shell) : null;
    const heroStyle = hero ? window.getComputedStyle(hero) : null;
    const cardStyle = cardGrid ? window.getComputedStyle(cardGrid) : null;
    const actionsStyle = actionsGrid ? window.getComputedStyle(actionsGrid) : null;
    const tipStyle = tipGrid ? window.getComputedStyle(tipGrid) : null;
    return {
      actionsColumns: actionsStyle ? actionsStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      cardColumns: cardStyle ? cardStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      heroColumns: heroStyle ? heroStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      shellHeight: shellRect?.height || 0,
      shellOverflowY: shellStyle?.overflowY || '',
      tipColumns: tipStyle ? tipStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      viewportHeight: window.innerHeight
    };
  });
  if (
    helpMetrics.heroColumns !== 2
    || helpMetrics.cardColumns !== 2
    || helpMetrics.actionsColumns !== 3
    || helpMetrics.tipColumns !== 2
    || helpMetrics.shellOverflowY !== 'auto'
    || helpMetrics.shellHeight < helpMetrics.viewportHeight - 160
  ) {
    throw new Error(`Tablet landscape help panel should use tablet-width sections inside a scroll-contained mobile shell: ${JSON.stringify(helpMetrics)}`);
  }
  await page.locator('#help-panel .collapse-btn').click();
  await page.locator('#help-panel.hidden').waitFor({ state: 'attached', timeout: 5000 });
  await expectMobileScrollLockReleased(page, 'Tablet landscape help panel');
  await cleanupMobilePageScroll(page);

  await openMobilePanel(page, 'toggle-templates', '#templates-search-input');
  await expectElementWithinViewport(page, '#templates-panel', 'Tablet landscape templates panel');
  await expectNoHorizontalOverflow(page, 'Tablet landscape templates panel');
  await page.locator('#templates-list .templates-list-item').click();
  await page.locator('#templates-detail-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  const templateDetailMetrics = await page.locator('#templates-detail').evaluate(detail => {
    const body = detail.querySelector('.templates-detail-body');
    const actions = detail.querySelector('.templates-detail-actions');
    const actionStyle = actions ? window.getComputedStyle(actions) : null;
    const bodyRect = body?.getBoundingClientRect();
    const actionsRect = actions?.getBoundingClientRect();
    return {
      actionColumns: actionStyle ? actionStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      actionsHeight: actionsRect?.height || 0,
      bodyHeight: bodyRect?.height || 0,
      viewportHeight: window.innerHeight
    };
  });
  if (
    templateDetailMetrics.actionColumns !== 4
    || templateDetailMetrics.actionsHeight > 72
    || templateDetailMetrics.bodyHeight < templateDetailMetrics.viewportHeight * 0.5
  ) {
    throw new Error(`Tablet landscape template detail should use one-row actions and preserve body space: ${JSON.stringify(templateDetailMetrics)}`);
  }
  await page.locator('#templates-detail-close-btn').click();
  await page.locator('#templates-detail-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });
  await page.locator('#templates-manage-categories-btn').click();
  await page.locator('#templates-categories-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  const templateCategoryMetrics = await page.locator('.templates-categories-dialog').evaluate(dialog => {
    const body = dialog.querySelector('.templates-categories-body');
    const list = dialog.querySelector('.templates-category-list');
    const bodyStyle = body ? window.getComputedStyle(body) : null;
    const listStyle = list ? window.getComputedStyle(list) : null;
    const bodyRect = body?.getBoundingClientRect();
    return {
      bodyColumns: bodyStyle ? bodyStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      bodyHeight: bodyRect?.height || 0,
      listColumns: listStyle ? listStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      viewportHeight: window.innerHeight
    };
  });
  if (
    templateCategoryMetrics.bodyColumns !== 2
    || templateCategoryMetrics.listColumns !== 2
    || templateCategoryMetrics.bodyHeight < templateCategoryMetrics.viewportHeight * 0.58
  ) {
    throw new Error(`Tablet landscape template categories should use tablet-width columns inside the mobile sheet: ${JSON.stringify(templateCategoryMetrics)}`);
  }
  await page.locator('#templates-categories-close-btn').click();
  await page.locator('#templates-categories-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });
  await page.locator('#templates-panel .collapse-btn').click();
  await page.locator('#templates-panel.hidden').waitFor({ state: 'attached', timeout: 5000 });

  await seedLoadedResults(page, { longTitle: true, rowCount: 36 });
  await expectResponsiveShellMode(page, 'mobile', 'Tablet landscape seeded table shell');
  await expectNoHorizontalOverflow(page, 'Tablet landscape seeded table');
  const tableMetrics = await page.evaluate(() => {
    const table = document.querySelector('#example-table');
    const tableRect = table?.getBoundingClientRect();
    const containerRect = document.querySelector('#table-container')?.getBoundingClientRect();
    const actionBar = document.querySelector('#mobile-table-action-bar');
    const actionBarRect = actionBar?.getBoundingClientRect();
    const actionBarStyle = actionBar ? window.getComputedStyle(actionBar) : null;
    const builder = document.querySelector('#mobile-builder-drawer');
    const builderRect = builder?.getBoundingClientRect();
    return {
      actionBarColumns: actionBarStyle ? actionBarStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      actionBarDisplay: actionBarStyle?.display || '',
      actionBarHeight: actionBarRect?.height || 0,
      builderActive: builder?.classList.contains('is-active') || false,
      builderTop: builderRect?.top || 0,
      containerTop: containerRect?.top || 0,
      containerWidth: containerRect?.width || 0,
      tableTop: tableRect?.top || 0,
      tableWidth: tableRect?.width || 0
    };
  });
  if (
    tableMetrics.actionBarDisplay !== 'grid'
    || tableMetrics.actionBarColumns !== 7
    || tableMetrics.actionBarHeight > 72
    || !tableMetrics.builderActive
    || tableMetrics.tableWidth > tableMetrics.containerWidth + 4
    || tableMetrics.containerTop > tableMetrics.builderTop + 1
  ) {
    throw new Error(`Tablet landscape table should use a one-row mobile action bar with the compact workflow: ${JSON.stringify(tableMetrics)}`);
  }
  await expectMinimumTapTarget(page, '#mobile-table-action-bar .mobile-table-action', 'Tablet landscape table action bar controls');
  await expectMobileTableContextMenu(page);
  await expectMobileHeaderDragDoesNotOpenContextMenu(page);
  await expectMobileColumnResizeInteraction(page);

  await primeMobilePageScroll(page);
  await page.locator('[data-mobile-table-action-target="table-add-field-btn"]').click();
  await page.locator('.form-mode-field-picker-modal:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  await expectElementWithinViewport(page, '.form-mode-field-picker-modal:not(.hidden)', 'Tablet landscape add field dialog');
  await expectNoHorizontalOverflow(page, 'Tablet landscape add field dialog');
  const addFieldMetrics = await page.locator('.form-mode-field-picker-modal:not(.hidden)').evaluate(modal => {
    const body = modal.querySelector('.form-mode-field-picker-body');
    const list = modal.querySelector('.form-mode-field-picker-list');
    const details = modal.querySelector('.form-mode-field-picker-details');
    const controls = modal.querySelector('.form-mode-field-picker-controls');
    const bodyStyle = body ? window.getComputedStyle(body) : null;
    const controlsStyle = controls ? window.getComputedStyle(controls) : null;
    const modalRect = modal.getBoundingClientRect();
    const listRect = list?.getBoundingClientRect();
    const detailsRect = details?.getBoundingClientRect();
    return {
      bodyColumns: bodyStyle ? bodyStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      bottomGap: Math.abs(window.innerHeight - modalRect.bottom),
      controlsColumns: controlsStyle ? controlsStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      detailsHeight: detailsRect?.height || 0,
      listHeight: listRect?.height || 0,
      modalWidth: modalRect.width,
      sideGapDelta: Math.abs(modalRect.left - Math.abs(window.innerWidth - modalRect.right)),
      top: modalRect.top,
      viewportHeight: window.innerHeight
    };
  });
  if (
    addFieldMetrics.bodyColumns !== 2
    || addFieldMetrics.controlsColumns !== 2
    || addFieldMetrics.listHeight < addFieldMetrics.viewportHeight * 0.48
    || addFieldMetrics.detailsHeight < addFieldMetrics.viewportHeight * 0.48
    || addFieldMetrics.sideGapDelta > 2
    || addFieldMetrics.top > 16
    || addFieldMetrics.bottomGap > 16
  ) {
    throw new Error(`Tablet landscape add field dialog should use a centered two-column mobile sheet: ${JSON.stringify(addFieldMetrics)}`);
  }
  await page.locator('.form-mode-field-picker-close').click();
  await expectMobileScrollLockReleased(page, 'Tablet landscape add field dialog');
  await cleanupMobilePageScroll(page);

  await primeMobilePageScroll(page);
  await page.locator('[data-mobile-table-action-target="post-filter-btn"]').click();
  await page.locator('#post-filter-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  await expectElementWithinViewport(page, '#post-filter-overlay .post-filter-dialog', 'Tablet landscape post filter dialog');
  await expectOverlayConsumesScroll(page, '.post-filter-dialog__body', 'Tablet landscape post filter dialog');
  const postFilterMetrics = await page.locator('#post-filter-overlay .post-filter-dialog').evaluate(dialog => {
    const builder = dialog.querySelector('.post-filter-builder');
    const actions = dialog.querySelector('.post-filter-dialog__actions');
    const valueRow = dialog.querySelector('.post-filter-value-row');
    const builderStyle = builder ? window.getComputedStyle(builder) : null;
    const actionsStyle = actions ? window.getComputedStyle(actions) : null;
    const valueRowStyle = valueRow ? window.getComputedStyle(valueRow) : null;
    const dialogRect = dialog.getBoundingClientRect();
    return {
      actionDirection: actionsStyle?.flexDirection || '',
      builderColumns: builderStyle ? builderStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      bottomGap: Math.abs(window.innerHeight - dialogRect.bottom),
      sideGapDelta: Math.abs(dialogRect.left - Math.abs(window.innerWidth - dialogRect.right)),
      valueColumns: valueRowStyle ? valueRowStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      width: dialogRect.width
    };
  });
  if (
    postFilterMetrics.builderColumns !== 2
    || postFilterMetrics.valueColumns !== 3
    || postFilterMetrics.actionDirection !== 'row'
    || postFilterMetrics.sideGapDelta > 2
    || postFilterMetrics.bottomGap > 8
  ) {
    throw new Error(`Tablet landscape post filter dialog should use tablet-width mobile controls: ${JSON.stringify(postFilterMetrics)}`);
  }
  await page.locator('#post-filter-operator').selectOption('equals');
  await page.locator('#post-filter-value-picker-host .form-mode-popup-list-trigger').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#post-filter-value-picker-host .form-mode-popup-list-trigger').click();
  await page.locator('.form-mode-popup-list-popup:not([hidden])').waitFor({ state: 'visible', timeout: 5000 });
  const popupListMetrics = await page.locator('.form-mode-popup-list-popup:not([hidden])').evaluate(popup => {
    const body = popup.querySelector('.form-mode-popup-list-popup-body');
    const options = popup.querySelector('.grouped-options-container');
    const popupRect = popup.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();
    const optionsRect = options?.getBoundingClientRect();
    return {
      bodyHeight: bodyRect?.height || 0,
      bottomGap: Math.abs(window.innerHeight - popupRect.bottom),
      optionsHeight: optionsRect?.height || 0,
      sideGapDelta: Math.abs(popupRect.left - Math.abs(window.innerWidth - popupRect.right)),
      viewportHeight: window.innerHeight,
      width: popupRect.width
    };
  });
  if (
    popupListMetrics.width < 560
    || popupListMetrics.width > 740
    || popupListMetrics.sideGapDelta > 2
    || popupListMetrics.optionsHeight < popupListMetrics.viewportHeight * 0.36
    || popupListMetrics.bottomGap > 8
  ) {
    throw new Error(`Tablet landscape popup list should be centered and wide enough for touch selection: ${JSON.stringify(popupListMetrics)}`);
  }
  await page.locator('.form-mode-popup-list-done').click();
  await page.locator('#post-filter-done-btn').click();
  await expectMobileScrollLockReleased(page, 'Tablet landscape post filter dialog');
  await cleanupMobilePageScroll(page);

  await primeMobilePageScroll(page);
  await openExportOverlayPromptly(page, '[data-mobile-table-action-target="download-btn"]', 'Tablet landscape export action');
  await expectElementWithinViewport(page, '#export-overlay .export-dialog', 'Tablet landscape export dialog');
  await waitForExportOptionsReady(page, 'Tablet landscape export dialog');
  await expectOverlayConsumesScroll(page, '.export-dialog__body', 'Tablet landscape export dialog');
  const exportMetrics = await page.locator('#export-overlay .export-dialog').evaluate(dialog => {
    const summary = dialog.querySelector('.export-dialog__summary');
    const modeGrid = dialog.querySelector('.export-mode-grid');
    const optionGrid = dialog.querySelector('.export-option-grid');
    const progress = dialog.querySelector('.export-progress');
    const summaryStyle = summary ? window.getComputedStyle(summary) : null;
    const modeStyle = modeGrid ? window.getComputedStyle(modeGrid) : null;
    const optionStyle = optionGrid ? window.getComputedStyle(optionGrid) : null;
    const progressStyle = progress ? window.getComputedStyle(progress) : null;
    const dialogRect = dialog.getBoundingClientRect();
    return {
      bottomGap: Math.abs(window.innerHeight - dialogRect.bottom),
      modeColumns: modeStyle ? modeStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      optionColumns: optionStyle ? optionStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      progressColumns: progressStyle && progressStyle.display !== 'none'
        ? progressStyle.gridTemplateColumns.split(' ').filter(Boolean).length
        : 2,
      sideGapDelta: Math.abs(dialogRect.left - Math.abs(window.innerWidth - dialogRect.right)),
      summaryColumns: summaryStyle ? summaryStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      width: dialogRect.width
    };
  });
  if (
    exportMetrics.summaryColumns !== 4
    || exportMetrics.modeColumns !== 2
    || exportMetrics.optionColumns !== 2
    || exportMetrics.progressColumns !== 2
    || exportMetrics.sideGapDelta > 2
    || exportMetrics.bottomGap > 8
  ) {
    throw new Error(`Tablet landscape export dialog should use tablet-width mobile columns: ${JSON.stringify(exportMetrics)}`);
  }
  await page.locator('#export-cancel-btn').click();
  await expectMobileScrollLockReleased(page, 'Tablet landscape export dialog');
  await cleanupMobilePageScroll(page);

  await page.locator('[data-mobile-table-action-target="table-expand-btn"]').click();
  await page.waitForFunction(() => document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });
  await expectElementWithinViewport(page, '#table-shell.table-shell-expanded', 'Tablet landscape expanded table');
  const tabletExpandedTableMetrics = await page.locator('#table-shell.table-shell-expanded').evaluate(shell => {
    const topBar = shell.querySelector('#table-top-bar');
    const container = shell.querySelector('#table-container');
    const table = shell.querySelector('#example-table');
    const topBarRect = topBar?.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect();
    const tableRect = table?.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    return {
      containerHeight: containerRect?.height || 0,
      containerTop: containerRect?.top || 0,
      containerWidth: containerRect?.width || 0,
      shellBottomGap: Math.abs(window.innerHeight - (shellRect?.bottom || 0)),
      shellTop: shellRect?.top || 0,
      tableWidth: tableRect?.width || 0,
      tableZoom: shell.style.getPropertyValue('--table-zoom') || '',
      topBarHeight: topBarRect?.height || 0,
      viewportHeight: window.innerHeight
    };
  });
  if (
    tabletExpandedTableMetrics.tableZoom !== '1.00'
    || tabletExpandedTableMetrics.topBarHeight > 70
    || tabletExpandedTableMetrics.containerHeight < tabletExpandedTableMetrics.viewportHeight - 110
    || tabletExpandedTableMetrics.tableWidth > tabletExpandedTableMetrics.containerWidth + 4
    || tabletExpandedTableMetrics.shellTop > 10
    || tabletExpandedTableMetrics.shellBottomGap > 10
  ) {
    throw new Error(`Tablet landscape expanded table should keep mobile chrome while using full tablet table zoom: ${JSON.stringify(tabletExpandedTableMetrics)}`);
  }
  await page.locator('#table-expand-btn').click();
  await page.waitForFunction(() => !document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });

  await page.locator('#mobile-builder-toggle').click();
  await page.waitForFunction(() => document.querySelector('#mobile-builder-drawer')?.classList.contains('is-open'), null, { timeout: 5000 });
  const builderMetrics = await page.evaluate(() => {
    const tableRect = document.querySelector('#table-with-filter')?.getBoundingClientRect();
    const builderRect = document.querySelector('#mobile-builder-drawer')?.getBoundingClientRect();
    return {
      builderExpanded: document.querySelector('#mobile-builder-toggle')?.getAttribute('aria-expanded') || '',
      builderTop: builderRect?.top || 0,
      tableTop: tableRect?.top || 0
    };
  });
  if (builderMetrics.builderExpanded !== 'true' || builderMetrics.builderTop < builderMetrics.tableTop - 1) {
    throw new Error(`Tablet landscape builder drawer should expand below the table: ${JSON.stringify(builderMetrics)}`);
  }
  await page.locator('#mobile-builder-toggle').click();

  await primeMobilePageScroll(page);
  await page.locator('[data-mobile-table-action="fields-panel"]').click();
  await page.waitForFunction(() => document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
  await expectElementWithinViewport(page, '#filter-side-panel', 'Tablet landscape display and filters sheet');
  await expectOverlayConsumesScroll(page, '#filter-panel-body .fp-display-section', 'Tablet landscape display and filters sheet');
  await expectNoHorizontalOverflow(page, 'Tablet landscape display and filters sheet');
  const filterSheetMetrics = await page.locator('#filter-side-panel').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const body = document.querySelector('#filter-panel-body');
    const bodyRect = body?.getBoundingClientRect();
    const bodyStyle = body ? window.getComputedStyle(body) : null;
    const sections = Array.from(body?.querySelectorAll('.fp-section') || []).map(section => {
      const sectionRect = section.getBoundingClientRect();
      return {
        height: sectionRect.height,
        overflowY: window.getComputedStyle(section).overflowY,
        scrollHeight: section.scrollHeight
      };
    });
    return {
      bodyHeight: bodyRect?.height || 0,
      bodyColumns: bodyStyle ? bodyStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      bottomGap: Math.abs(window.innerHeight - rect.bottom),
      left: rect.left,
      position: window.getComputedStyle(element).position,
      right: rect.right,
      sectionCount: sections.length,
      sections,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  });
  if (
    filterSheetMetrics.position !== 'fixed'
    || filterSheetMetrics.left < -1
    || filterSheetMetrics.right > filterSheetMetrics.viewportWidth + 1
    || filterSheetMetrics.top < 48
    || filterSheetMetrics.bottomGap > 24
    || filterSheetMetrics.bodyHeight < filterSheetMetrics.viewportHeight * 0.46
    || filterSheetMetrics.bodyColumns !== 2
    || filterSheetMetrics.sectionCount < 2
    || filterSheetMetrics.sections.some(section => section.overflowY === 'visible' || section.height < filterSheetMetrics.bodyHeight * 0.82)
  ) {
    throw new Error(`Tablet landscape display and filters should remain a usable mobile sheet: ${JSON.stringify(filterSheetMetrics)}`);
  }
  await page.locator('#filter-panel-mobile-close').click();
  await page.waitForFunction(() => !document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
  await expectMobileScrollLockReleased(page, 'Tablet landscape display and filters sheet');
  await cleanupMobilePageScroll(page);
}

async function exerciseTabletPortraitMobileParity(page, queryApiStub) {
  await page.setViewportSize({ width: 820, height: 1180 });
  await waitForResponsiveResize(page, true);
  await expectMobileViewportStability(page);
  await expectNoHorizontalOverflow(page, 'Tablet portrait initial layout');

  const initialShellMetrics = await readResponsiveShellMetrics(page);
  if (
    !initialShellMetrics.isMobile
    || initialShellMetrics.headerControlsDisplay !== 'none'
    || initialShellMetrics.mobileMenuDisplay === 'none'
    || initialShellMetrics.tableZoom !== '0.84'
  ) {
    throw new Error(`Tablet portrait should start in the mobile shell: ${JSON.stringify(initialShellMetrics)}`);
  }

  await page.locator('#mobile-menu-toggle').click();
  await page.locator('#mobile-menu-dropdown.show').waitFor({ state: 'visible', timeout: 5000 });
  await expectMinimumTapTarget(page, '#mobile-menu-dropdown .mobile-menu-item', 'Tablet portrait mobile menu items');
  const menuMetrics = await page.locator('#mobile-menu-dropdown.show').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const items = document.querySelector('#mobile-menu-items');
    const itemsStyle = items ? window.getComputedStyle(items) : null;
    return {
      bottomGap: Math.abs(window.innerHeight - rect.bottom),
      columns: itemsStyle ? itemsStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      height: rect.height,
      sideGapDelta: Math.abs(rect.left - Math.abs(window.innerWidth - rect.right)),
      viewportHeight: window.innerHeight,
      width: rect.width
    };
  });
  if (
    menuMetrics.columns !== 3
    || menuMetrics.sideGapDelta > 2
    || menuMetrics.width < 680
    || menuMetrics.bottomGap > 1
    || menuMetrics.height > menuMetrics.viewportHeight * 0.65
  ) {
    throw new Error(`Tablet portrait should use the tablet-width mobile menu sheet: ${JSON.stringify(menuMetrics)}`);
  }
  await page.locator('#mobile-menu-dropdown .collapse-btn').click();
  await page.locator('#mobile-menu-dropdown.hidden').waitFor({ state: 'attached', timeout: 5000 });

  queueHistoryStatusResponses(queryApiStub);
  await openMobilePanel(page, 'toggle-queries', '#queries-search');
  await page.waitForFunction(() => {
    return document.querySelector('[data-history-book="complete"] .history-book-count')?.textContent?.trim() === '1'
      && document.querySelector('[data-history-book="running"] .history-book-count')?.textContent?.trim() === '1';
  }, null, { timeout: 5000 });
  const historyMetrics = await page.locator('.history-bookshelf').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
      height: rect.height
    };
  });
  if (historyMetrics.columns !== 4 || historyMetrics.height > 120) {
    throw new Error(`Tablet portrait history picker should keep all statuses compact: ${JSON.stringify(historyMetrics)}`);
  }
  await page.locator('#queries-panel .collapse-btn').click();
  await page.locator('#queries-panel.hidden').waitFor({ state: 'attached', timeout: 5000 });

  await seedLoadedResults(page, { longTitle: true, rowCount: 24 });
  await expectResponsiveShellMode(page, 'mobile', 'Tablet portrait seeded table shell');
  await expectNoHorizontalOverflow(page, 'Tablet portrait seeded table');
  const tableMetrics = await page.evaluate(() => {
    const actionBar = document.querySelector('#mobile-table-action-bar');
    const actionBarRect = actionBar?.getBoundingClientRect();
    const actionBarStyle = actionBar ? window.getComputedStyle(actionBar) : null;
    const tableRect = document.querySelector('#example-table')?.getBoundingClientRect();
    const containerRect = document.querySelector('#table-container')?.getBoundingClientRect();
    return {
      actionBarColumns: actionBarStyle ? actionBarStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      actionBarHeight: actionBarRect?.height || 0,
      containerWidth: containerRect?.width || 0,
      tableWidth: tableRect?.width || 0
    };
  });
  if (
    tableMetrics.actionBarColumns !== 7
    || tableMetrics.actionBarHeight > 72
    || tableMetrics.tableWidth > tableMetrics.containerWidth + 4
  ) {
    throw new Error(`Tablet portrait table should keep tablet action density: ${JSON.stringify(tableMetrics)}`);
  }

  await primeMobilePageScroll(page);
  await page.locator('[data-mobile-table-action-target="table-add-field-btn"]').click();
  await page.locator('.form-mode-field-picker-modal:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  await expectElementWithinViewport(page, '.form-mode-field-picker-modal:not(.hidden)', 'Tablet portrait add field dialog');
  const addFieldMetrics = await page.locator('.form-mode-field-picker-modal:not(.hidden)').evaluate(modal => {
    const body = modal.querySelector('.form-mode-field-picker-body');
    const list = modal.querySelector('.form-mode-field-picker-list');
    const details = modal.querySelector('.form-mode-field-picker-details');
    const bodyStyle = body ? window.getComputedStyle(body) : null;
    const modalRect = modal.getBoundingClientRect();
    const listRect = list?.getBoundingClientRect();
    const detailsRect = details?.getBoundingClientRect();
    return {
      bodyColumns: bodyStyle ? bodyStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      detailsHeight: detailsRect?.height || 0,
      listHeight: listRect?.height || 0,
      sideGapDelta: Math.abs(modalRect.left - Math.abs(window.innerWidth - modalRect.right)),
      width: modalRect.width
    };
  });
  if (
    addFieldMetrics.bodyColumns !== 2
    || addFieldMetrics.width < 760
    || addFieldMetrics.sideGapDelta > 2
    || addFieldMetrics.listHeight < 420
    || addFieldMetrics.detailsHeight < 420
  ) {
    throw new Error(`Tablet portrait add field dialog should retain tablet two-column layout: ${JSON.stringify(addFieldMetrics)}`);
  }
  await page.locator('.form-mode-field-picker-close').click();
  await expectMobileScrollLockReleased(page, 'Tablet portrait add field dialog');
  await cleanupMobilePageScroll(page);

  await primeMobilePageScroll(page);
  await page.locator('[data-mobile-table-action="fields-panel"]').click();
  await page.waitForFunction(() => document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
  await expectElementWithinViewport(page, '#filter-side-panel', 'Tablet portrait display and filters sheet');
  await expectOverlayConsumesScroll(page, '#filter-panel-body .fp-display-section', 'Tablet portrait display and filters sheet');
  const filterSheetMetrics = await page.locator('#filter-side-panel').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const body = document.querySelector('#filter-panel-body');
    const bodyRect = body?.getBoundingClientRect();
    const bodyStyle = body ? window.getComputedStyle(body) : null;
    return {
      bodyColumns: bodyStyle ? bodyStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      bodyHeight: bodyRect?.height || 0,
      bottomGap: Math.abs(window.innerHeight - rect.bottom),
      top: rect.top,
      viewportHeight: window.innerHeight
    };
  });
  if (
    filterSheetMetrics.bodyColumns !== 2
    || filterSheetMetrics.top < 48
    || filterSheetMetrics.bottomGap > 24
    || filterSheetMetrics.bodyHeight < filterSheetMetrics.viewportHeight * 0.62
  ) {
    throw new Error(`Tablet portrait display and filters should use the tablet two-column sheet: ${JSON.stringify(filterSheetMetrics)}`);
  }
  await page.locator('#filter-panel-mobile-close').click();
  await page.waitForFunction(() => !document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
  await expectMobileScrollLockReleased(page, 'Tablet portrait display and filters sheet');
  await cleanupMobilePageScroll(page);

  await page.locator('[data-mobile-table-action-target="table-expand-btn"]').click();
  await page.waitForFunction(() => document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });
  const expandedMetrics = await page.locator('#table-shell.table-shell-expanded').evaluate(shell => {
    const container = shell.querySelector('#table-container');
    const table = shell.querySelector('#example-table');
    const shellRect = shell.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect();
    const tableRect = table?.getBoundingClientRect();
    return {
      containerHeight: containerRect?.height || 0,
      containerWidth: containerRect?.width || 0,
      shellBottomGap: Math.abs(window.innerHeight - shellRect.bottom),
      shellTop: shellRect.top,
      tableWidth: tableRect?.width || 0,
      tableZoom: shell.style.getPropertyValue('--table-zoom') || '',
      viewportHeight: window.innerHeight
    };
  });
  if (
    expandedMetrics.tableZoom !== '1.00'
    || expandedMetrics.shellTop > 10
    || expandedMetrics.shellBottomGap > 10
    || expandedMetrics.containerHeight < expandedMetrics.viewportHeight - 110
    || expandedMetrics.tableWidth > expandedMetrics.containerWidth + 4
  ) {
    throw new Error(`Tablet portrait expanded table should use tablet zoom and full-height chrome: ${JSON.stringify(expandedMetrics)}`);
  }
  await page.locator('#table-expand-btn').click();
  await page.waitForFunction(() => !document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });
}

async function exerciseEditableFormUrlRefresh(page, failures) {
  await seedLoadedResults(page);
  await page.evaluate(async () => {
    const { QueryFormMode } = await import('./src/ui/form-mode/formMode.js');
    await QueryFormMode.activateFromCurrentQuery();
  });
  await page.locator('#form-mode-card').waitFor({ state: 'visible', timeout: 5000 });

  const editableUrl = new URL(page.url());
  if (!editableUrl.searchParams.has('form') || editableUrl.searchParams.has('limited') || editableUrl.searchParams.has('mode')) {
    throw new Error(`Editable form browser URL should stay in core mode without limited or legacy mode flags: ${editableUrl.toString()}`);
  }

  await page.reload({ waitUntil: 'load', timeout: 15000 });
  await waitForAppReady(page, failures);
  await page.locator('#form-mode-card').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => document.body.classList.contains('form-mode-active'), null, { timeout: 5000 });
  const refreshedState = await page.evaluate(async () => {
    const { QueryFormMode } = await import('./src/ui/form-mode/formMode.js');
    const browserUrl = new URL(window.location.href);
    const shareUrl = new URL(QueryFormMode.buildCurrentShareUrl());
    return {
      active: QueryFormMode.isActive(),
      browserHasLimited: browserUrl.searchParams.has('limited'),
      browserHasMode: browserUrl.searchParams.has('mode'),
      formModeActiveClass: document.body.classList.contains('form-mode-active'),
      limitedView: QueryFormMode.isLimitedView(),
      shareLimited: shareUrl.searchParams.get('limited')
    };
  });

  if (
    !refreshedState.active
    || refreshedState.limitedView
    || !refreshedState.formModeActiveClass
    || refreshedState.browserHasLimited
    || refreshedState.browserHasMode
    || refreshedState.shareLimited !== '1'
  ) {
    throw new Error(`Refreshing an editable form URL should stay editable in core mode, while Share remains limited: ${JSON.stringify(refreshedState)}`);
  }

  const cleanUrl = new URL(page.url());
  cleanUrl.search = '';
  cleanUrl.hash = '';
  await page.goto(cleanUrl.toString(), { waitUntil: 'load', timeout: 15000 });
  await waitForAppReady(page, failures);
}

async function exerciseLegacyFormUrlCanonicalization(page, baseUrl, failures) {
  const formSpec = {
    title: 'Legacy Limited Form',
    queryName: 'Legacy Limited Form',
    description: '',
    columns: ['Smoke Title'],
    lockedFilters: [],
    inputs: [],
    limitedView: true,
    viewMode: 'limited'
  };
  const legacyUrl = new URL(baseUrl);
  legacyUrl.searchParams.set('form', encodeFormSpecForUrl(formSpec));
  legacyUrl.searchParams.set('mode', 'limited');
  legacyUrl.searchParams.set('view', 'limited');
  legacyUrl.searchParams.set('limitedView', '1');
  legacyUrl.searchParams.set('limited', 'false');
  legacyUrl.searchParams.set('stale', '1');

  await page.goto(legacyUrl.toString(), { waitUntil: 'load', timeout: 15000 });
  await waitForAppReady(page, failures);
  await page.locator('#form-mode-card').waitFor({ state: 'visible', timeout: 5000 });

  const canonicalState = await page.evaluate(async () => {
    const { QueryFormMode } = await import('./src/ui/form-mode/formMode.js');
    const browserUrl = new URL(window.location.href);
    const decodedSpec = QueryFormMode.decodeSpec(browserUrl.searchParams.get('form'));
    return {
      decodedHasLimited: Object.prototype.hasOwnProperty.call(decodedSpec, 'limited'),
      decodedHasLimitedView: Object.prototype.hasOwnProperty.call(decodedSpec, 'limitedView'),
      decodedHasViewMode: Object.prototype.hasOwnProperty.call(decodedSpec, 'viewMode'),
      hasForm: browserUrl.searchParams.has('form'),
      hasLimitedViewParam: browserUrl.searchParams.has('limitedView'),
      hasMode: browserUrl.searchParams.has('mode'),
      hasStale: browserUrl.searchParams.has('stale'),
      hasView: browserUrl.searchParams.has('view'),
      isLimitedView: QueryFormMode.isLimitedView(),
      limited: browserUrl.searchParams.get('limited'),
      tableName: browserUrl.searchParams.get('tableName')
    };
  });

  if (
    !canonicalState.hasForm
    || canonicalState.limited !== '1'
    || canonicalState.tableName !== 'Legacy Limited Form'
    || canonicalState.hasMode
    || canonicalState.hasView
    || canonicalState.hasLimitedViewParam
    || canonicalState.hasStale
    || canonicalState.decodedHasLimited
    || canonicalState.decodedHasLimitedView
    || canonicalState.decodedHasViewMode
    || !canonicalState.isLimitedView
  ) {
    throw new Error(`Legacy limited form URLs should canonicalize to current params: ${JSON.stringify(canonicalState)}`);
  }
}

async function exerciseVirtualTableScrollInteraction(page) {
  await seedLoadedResults(page, { rowCount: 320 });

  const tableContainer = page.locator('#table-container');
  const beforeMetrics = await tableContainer.evaluate(element => ({
    clientHeight: element.clientHeight,
    renderedRowCount: document.querySelectorAll('#example-table tbody tr[data-row-index]').length,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    visibleRowIndexBelowHeader: 0
  }));

  if (beforeMetrics.scrollHeight <= beforeMetrics.clientHeight) {
    throw new Error(`Virtual table is not scrollable: ${JSON.stringify(beforeMetrics)}`);
  }

  if (beforeMetrics.renderedRowCount !== 320) {
    throw new Error(`Ordinary result sets should use native table scrolling; rendered ${beforeMetrics.renderedRowCount} rows`);
  }

  await tableContainer.hover();
  await page.mouse.wheel(0, 9000);
  await page.waitForFunction(() => {
    const container = document.querySelector('#table-container');
    const header = document.querySelector('#example-table thead th');
    if (!container || !header) {
      return false;
    }

    const containerRect = container.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const visibleRow = document
      .elementFromPoint(containerRect.left + 80, headerRect.bottom + 8)
      ?.closest('tr[data-row-index]');
    return Boolean(container.scrollTop > 500 && Number(visibleRow?.dataset.rowIndex || 0) > 10);
  }, null, { timeout: 5000 });

  const afterMetrics = await tableContainer.evaluate(element => ({
    renderedRowCount: document.querySelectorAll('#example-table tbody tr[data-row-index]').length,
    scrollTop: element.scrollTop,
    visibleRowIndexBelowHeader: Number(
      document
        .elementFromPoint(
          element.getBoundingClientRect().left + 80,
          document.querySelector('#example-table thead th').getBoundingClientRect().bottom + 8
        )
        ?.closest('tr[data-row-index]')
        ?.dataset.rowIndex || 0
    )
  }));

  if (afterMetrics.scrollTop <= beforeMetrics.scrollTop || afterMetrics.visibleRowIndexBelowHeader <= beforeMetrics.visibleRowIndexBelowHeader) {
    throw new Error(`Virtual table did not advance after wheel scroll: before=${JSON.stringify(beforeMetrics)}, after=${JSON.stringify(afterMetrics)}`);
  }

  await page.evaluate(() => {
    const container = document.querySelector('#table-container');
    if (container) {
      container.scrollTop = 0;
    }
  });
  await page.waitForFunction(() => {
    const container = document.querySelector('#table-container');
    const track = document.querySelector('.table-scrollbar');
    const thumb = document.querySelector('.table-scrollbar-thumb');
    if (!container || !track || !thumb) {
      return false;
    }

    const trackTop = track.getBoundingClientRect().top;
    const thumbTop = thumb.getBoundingClientRect().top;
    return container.scrollTop === 0 && Math.abs(trackTop - thumbTop) <= 1;
  }, null, { timeout: 5000 });
  await page.locator('.table-scrollbar-thumb').waitFor({ state: 'visible', timeout: 5000 });
  const thumbBox = await page.locator('.table-scrollbar-thumb').boundingBox();
  if (!thumbBox) {
    throw new Error('Virtual table custom scrollbar thumb was not measurable');
  }

  const dragStart = {
    x: Math.floor(thumbBox.x + (thumbBox.width / 2)),
    y: Math.floor(thumbBox.y + Math.min(10, thumbBox.height / 2))
  };
  const dragStartTarget = await page.evaluate(({ x, y }) => {
    const node = document.elementFromPoint(x, y);
    return {
      className: typeof node?.className === 'string' ? node.className : '',
      id: node?.id || '',
      tagName: node?.tagName || ''
    };
  }, dragStart);
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x, dragStart.y + 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    return (document.querySelector('#table-container')?.scrollTop || 0) > 1000;
  }, null, { timeout: 5000 }).catch(async error => {
    const dragMetrics = await page.evaluate(() => {
      const container = document.querySelector('#table-container');
      const track = document.querySelector('.table-scrollbar');
      const thumb = document.querySelector('.table-scrollbar-thumb');
      const containerRect = container?.getBoundingClientRect();
      const trackRect = track?.getBoundingClientRect();
      const thumbRect = thumb?.getBoundingClientRect();
      return {
        bodyClass: document.body.className,
        container: container && containerRect ? {
          clientHeight: container.clientHeight,
          scrollHeight: container.scrollHeight,
          scrollTop: container.scrollTop,
          top: containerRect.top
        } : null,
        customScrollbarVisible: track?.classList.contains('is-visible') || false,
        track: trackRect ? {
          height: trackRect.height,
          top: trackRect.top
        } : null,
        thumb: thumbRect ? {
          height: thumbRect.height,
          top: thumbRect.top
        } : null
      };
    });
    throw new Error(`Virtual table custom scrollbar thumb drag did not scroll far enough: ${JSON.stringify({ ...dragMetrics, dragStart, dragStartTarget })}\n${error.message}`);
  });

  const thumbDragMetrics = await tableContainer.evaluate(element => ({
    customScrollbarVisible: document.querySelector('.table-scrollbar')?.classList.contains('is-visible') || false,
    scrollTop: element.scrollTop,
    visibleRowIndexBelowHeader: Number(
      document
        .elementFromPoint(
          element.getBoundingClientRect().left + 80,
          document.querySelector('#example-table thead th').getBoundingClientRect().bottom + 8
        )
        ?.closest('tr[data-row-index]')
        ?.dataset.rowIndex || 0
    )
  }));

  if (!thumbDragMetrics.customScrollbarVisible || thumbDragMetrics.scrollTop <= 1000 || thumbDragMetrics.visibleRowIndexBelowHeader <= 10) {
    throw new Error(`Virtual table did not advance after scrollbar thumb drag: ${JSON.stringify(thumbDragMetrics)}`);
  }

  await page.evaluate(() => {
    document.body.dataset.browserSmokePreviousMinHeight = document.body.style.minHeight || '';
    document.body.style.minHeight = '1800px';
    window.scrollTo(0, 0);
    const container = document.querySelector('#table-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
  await tableContainer.hover();
  await page.mouse.wheel(0, 2400);
  await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 5000 });
  const boundaryMetrics = await page.evaluate(() => ({
    bodyScrollY: window.scrollY,
    tableScrollTop: document.querySelector('#table-container')?.scrollTop || 0
  }));
  await page.evaluate(() => {
    document.body.style.minHeight = document.body.dataset.browserSmokePreviousMinHeight || '';
    delete document.body.dataset.browserSmokePreviousMinHeight;
  });

  if (boundaryMetrics.bodyScrollY !== 0) {
    throw new Error(`Virtual table leaked wheel scrolling to the page at the result boundary: ${JSON.stringify(boundaryMetrics)}`);
  }
}

async function exerciseExpandedVirtualTableColumnAlignment(page) {
  await seedLoadedResults(page, { rowCount: 2400 });

  await page.locator('#table-expand-btn').click();
  await page.locator('#table-shell.table-shell-expanded').waitFor({ state: 'attached', timeout: 5000 });

  const readAlignmentMetrics = () => page.evaluate(() => {
    const container = document.querySelector('#table-container');
    const table = document.querySelector('#example-table');
    const firstRow = table?.querySelector('tbody tr[data-row-index]');
    const headers = Array.from(table?.querySelectorAll('thead th[data-col-index]') || []);
    const cells = Array.from(firstRow?.querySelectorAll('td[data-col-index]') || []);

    if (!container || !table || headers.length === 0 || cells.length < headers.length) {
      return null;
    }

    const headerWidths = headers.map(header => Math.round(header.getBoundingClientRect().width));
    const cellWidths = cells.slice(0, headers.length).map(cell => Math.round(cell.getBoundingClientRect().width));
    const maxDelta = headerWidths.reduce((delta, width, index) => {
      return Math.max(delta, Math.abs(width - cellWidths[index]));
    }, 0);
    const tableWidth = Math.round(table.getBoundingClientRect().width);
    const containerWidth = Math.floor(container.clientWidth);

    return {
      cellWidths,
      containerWidth,
      headerWidths,
      maxDelta,
      tableWidth
    };
  });

  try {
    await page.waitForFunction(() => {
      const container = document.querySelector('#table-container');
      const table = document.querySelector('#example-table');
      const firstRow = table?.querySelector('tbody tr[data-row-index]');
      const headers = Array.from(table?.querySelectorAll('thead th[data-col-index]') || []);
      const cells = Array.from(firstRow?.querySelectorAll('td[data-col-index]') || []);

      if (!container || !table || headers.length === 0 || cells.length < headers.length) {
        return false;
      }

      const headerWidths = headers.map(header => Math.round(header.getBoundingClientRect().width));
      const cellWidths = cells.slice(0, headers.length).map(cell => Math.round(cell.getBoundingClientRect().width));
      const maxDelta = headerWidths.reduce((delta, width, index) => {
        return Math.max(delta, Math.abs(width - cellWidths[index]));
      }, 0);
      const tableWidth = Math.round(table.getBoundingClientRect().width);
      const containerWidth = Math.floor(container.clientWidth);

      return maxDelta <= 1 && tableWidth >= containerWidth - 2;
    }, null, { timeout: 5000 });
  } catch (error) {
    const observedMetrics = await readAlignmentMetrics();
    throw new Error(`Expanded virtual table columns did not align: ${JSON.stringify(observedMetrics)}: ${error.message}`);
  }

  const alignmentMetrics = await readAlignmentMetrics();
  if (alignmentMetrics.maxDelta > 1 || alignmentMetrics.tableWidth < alignmentMetrics.containerWidth - 2) {
    throw new Error(`Expanded virtual table columns are misaligned: ${JSON.stringify(alignmentMetrics)}`);
  }

  await page.locator('#table-expand-btn').click();
  await page.waitForFunction(() => !document.querySelector('#table-shell')?.classList.contains('table-shell-expanded'), null, { timeout: 5000 });
}

async function exerciseColumnResizeInteraction(page) {
  await seedLoadedResults(page, { longTitle: true, rowCount: 2400 });

  await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    appServices.setManualColumnWidth?.('Smoke Title', 90);
    appServices.renderVirtualTable?.();
    appServices.activateColumnResizeMode?.('Smoke Title');
  });

  const titleHeader = page.locator('#example-table th[data-sort-field="Smoke Title"]').first();
  const rightHandle = titleHeader.locator('.th-resize-handle-right').first();
  await titleHeader.waitFor({ state: 'visible', timeout: 5000 });
  await rightHandle.waitFor({ state: 'visible', timeout: 5000 });

  const beforeMetrics = await page.evaluate(() => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const truncatedTextEl = titleCellEl?.querySelector('.query-table-truncated-text');
    const tableEl = document.querySelector('#example-table');
    return {
      cellWidth: Math.round(titleCellEl?.getBoundingClientRect().width || 0),
      hasTruncatedTrigger: Boolean(titleCellEl?.querySelector('.query-table-truncated-trigger')),
      headerWidth: Math.round(titleHeaderEl?.getBoundingClientRect().width || 0),
      isEllipsized: Boolean(truncatedTextEl && truncatedTextEl.scrollWidth - truncatedTextEl.clientWidth > 1),
      rowWidth: Math.round(titleRowEl?.getBoundingClientRect().width || 0),
      tableWidth: Math.round(tableEl?.getBoundingClientRect().width || 0),
      text: titleCellEl?.textContent?.trim() || '',
      resizeModeActive: document.body.classList.contains('table-resize-mode')
    };
  });

  if (
    !beforeMetrics.resizeModeActive
    || beforeMetrics.headerWidth <= 0
    || Math.abs(beforeMetrics.headerWidth - beforeMetrics.cellWidth) > 1
    || Math.abs(beforeMetrics.tableWidth - beforeMetrics.rowWidth) > 1
    || !beforeMetrics.hasTruncatedTrigger
    || !beforeMetrics.isEllipsized
  ) {
    throw new Error(`Column resize did not start from an aligned active state: ${JSON.stringify(beforeMetrics)}`);
  }

  const handleBox = await rightHandle.boundingBox();
  if (!handleBox) {
    throw new Error('Column resize handle was not measurable');
  }

  const dragStartX = Math.floor(handleBox.x + (handleBox.width / 2));
  const dragStartY = Math.floor(handleBox.y + (handleBox.height / 2));
  const resizeDelta = 620;
  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + resizeDelta, dragStartY, { steps: 8 });

  await page.waitForFunction(({ expectedWidth }) => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    const headerWidth = Math.round(titleHeaderEl?.getBoundingClientRect().width || 0);
    const cellWidth = Math.round(titleCellEl?.getBoundingClientRect().width || 0);
    const rowWidth = Math.round(titleRowEl?.getBoundingClientRect().width || 0);
    const tableWidth = Math.round(tableEl?.getBoundingClientRect().width || 0);
    return Math.abs(headerWidth - expectedWidth) <= 2
      && Math.abs(headerWidth - cellWidth) <= 1
      && Math.abs(tableWidth - rowWidth) <= 1
      && !titleCellEl?.querySelector('.query-table-truncated-trigger');
  }, { expectedWidth: beforeMetrics.headerWidth + resizeDelta }, { timeout: 5000 });

  const duringMetrics = await page.evaluate(() => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    return {
      cellWidth: Math.round(titleCellEl?.getBoundingClientRect().width || 0),
      hasTruncatedTrigger: Boolean(titleCellEl?.querySelector('.query-table-truncated-trigger')),
      headerWidth: Math.round(titleHeaderEl?.getBoundingClientRect().width || 0),
      rowWidth: Math.round(titleRowEl?.getBoundingClientRect().width || 0),
      tableWidth: Math.round(tableEl?.getBoundingClientRect().width || 0),
      text: titleCellEl?.textContent?.trim() || '',
      resizeModeActive: document.body.classList.contains('table-resize-mode')
    };
  });

  await page.mouse.up();

  await page.waitForFunction(({ expectedWidth }) => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    const headerWidth = Math.round(titleHeaderEl?.getBoundingClientRect().width || 0);
    const cellWidth = Math.round(titleCellEl?.getBoundingClientRect().width || 0);
    const rowWidth = Math.round(titleRowEl?.getBoundingClientRect().width || 0);
    const tableWidth = Math.round(tableEl?.getBoundingClientRect().width || 0);
    return Math.abs(headerWidth - expectedWidth) <= 2
      && Math.abs(headerWidth - cellWidth) <= 1
      && Math.abs(tableWidth - rowWidth) <= 1;
  }, { expectedWidth: beforeMetrics.headerWidth + resizeDelta }, { timeout: 5000 });

  const afterMetrics = await page.evaluate(() => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    return {
      cellWidth: Math.round(titleCellEl?.getBoundingClientRect().width || 0),
      hasTruncatedTrigger: Boolean(titleCellEl?.querySelector('.query-table-truncated-trigger')),
      headerWidth: Math.round(titleHeaderEl?.getBoundingClientRect().width || 0),
      rowWidth: Math.round(titleRowEl?.getBoundingClientRect().width || 0),
      tableWidth: Math.round(tableEl?.getBoundingClientRect().width || 0),
      text: titleCellEl?.textContent?.trim() || '',
      resizeModeActive: document.body.classList.contains('table-resize-mode')
    };
  });

  const liveDelta = duringMetrics.headerWidth - beforeMetrics.headerWidth;
  const actualDelta = afterMetrics.headerWidth - beforeMetrics.headerWidth;
  if (
    Math.abs(liveDelta - resizeDelta) > 2
    || Math.abs(actualDelta - resizeDelta) > 2
    || Math.abs(duringMetrics.headerWidth - duringMetrics.cellWidth) > 1
    || Math.abs(duringMetrics.tableWidth - duringMetrics.rowWidth) > 1
    || duringMetrics.hasTruncatedTrigger
    || Math.abs(afterMetrics.headerWidth - afterMetrics.cellWidth) > 1
    || Math.abs(afterMetrics.tableWidth - afterMetrics.rowWidth) > 1
    || afterMetrics.hasTruncatedTrigger
  ) {
    throw new Error(`Column resize drag was nonlinear or misaligned: before=${JSON.stringify(beforeMetrics)}, during=${JSON.stringify(duringMetrics)}, after=${JSON.stringify(afterMetrics)}`);
  }

  await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    appServices.clearColumnResizeMode?.();
  });
}

async function exerciseColumnDragOutsideTableInteraction(page) {
  await seedWideDragResults(page);
  await page.locator('#table-container').evaluate(container => {
    container.scrollLeft = 0;
  });

  const sourceHeader = page.locator('#example-table th[data-col-index="0"]');
  await sourceHeader.waitFor({ state: 'visible', timeout: 5000 });
  const headerBox = await sourceHeader.boundingBox();
  const containerBox = await page.locator('#table-container').boundingBox();
  if (!headerBox || !containerBox) {
    throw new Error(`Unable to measure column drag targets: ${JSON.stringify({ headerBox, containerBox })}`);
  }

  const startX = Math.round(headerBox.x + (headerBox.width / 2));
  const startY = Math.round(headerBox.y + (headerBox.height / 2));
  const outsideX = Math.round(containerBox.x + containerBox.width + 36);
  const outsideY = Math.max(8, Math.round(containerBox.y - 36));

  const dragMetrics = await page.evaluate(async ({ outsideX: dragX, outsideY: dragY, startX: dragStartX, startY: dragStartY }) => {
    const source = document.querySelector('#example-table th[data-col-index="0"]');
    const dataTransfer = new DataTransfer();
    const dispatchDragEvent = (target, type, x, y) => {
      const event = new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        dataTransfer
      });
      target.dispatchEvent(event);
      return event;
    };
    const readMetrics = () => {
      const container = document.querySelector('#table-container');
      const anchor = document.querySelector('.drop-anchor');
      const highlighted = Array.from(document.querySelectorAll('#example-table .query-table-column-drop-target')).map(element => ({
        colIndex: element.getAttribute('data-col-index'),
        tagName: element.tagName
      }));
      return {
        anchorDisplay: anchor ? window.getComputedStyle(anchor).display : '',
        bodyClass: document.body.className,
        clientWidth: container?.clientWidth || 0,
        highlighted,
        scrollLeft: container?.scrollLeft || 0,
        scrollWidth: container?.scrollWidth || 0
      };
    };

    dispatchDragEvent(source, 'dragstart', dragStartX, dragStartY);
    const startTime = Date.now();
    let during = readMetrics();
    while (Date.now() - startTime < 2500) {
      dispatchDragEvent(document, 'dragover', dragX, dragY);
      await new Promise(resolve => setTimeout(resolve, 32));
      during = readMetrics();
      if (
        during.scrollLeft > 0
        && during.anchorDisplay !== 'none'
        && during.highlighted.length > 1
        && during.highlighted.some(entry => entry.tagName === 'TD')
      ) {
        break;
      }
    }

    dispatchDragEvent(document, 'drop', dragX, dragY);
    dispatchDragEvent(source, 'dragend', dragX, dragY);
    await new Promise(resolve => setTimeout(resolve, 50));
    const after = readMetrics();
    return { after, during };
  }, { outsideX, outsideY, startX, startY });

  if (
    dragMetrics.during.scrollLeft <= 0
    || dragMetrics.during.anchorDisplay === 'none'
    || dragMetrics.during.highlighted.length <= 1
    || !dragMetrics.during.highlighted.some(entry => entry.tagName === 'TD')
  ) {
    throw new Error(`Column drag outside table should keep auto-scrolling and highlight the target column: ${JSON.stringify(dragMetrics.during)}`);
  }

  if (
    dragMetrics.after.anchorDisplay !== 'none'
    || dragMetrics.after.highlighted.length > 0
    || /dragging-cursor/u.test(dragMetrics.after.bodyClass)
  ) {
    throw new Error(`Column drag outside table should clean up after drop: ${JSON.stringify(dragMetrics.after)}`);
  }
}

async function expectMobileColumnResizeInteraction(page) {
  await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    appServices.setManualColumnWidth?.('Smoke Title', 96);
    appServices.renderVirtualTable?.();
  });

  const titleHeader = page.locator('#example-table th[data-sort-field="Smoke Title"]').first();
  const firstCell = page.locator('#example-table tbody tr[data-row-index="0"] td[data-col-index="0"]');
  await titleHeader.waitFor({ state: 'visible', timeout: 5000 });
  await firstCell.waitFor({ state: 'visible', timeout: 5000 });

  await longPressLocatorWithDomTouchEvents(firstCell);
  await expectVisibleMobileTableContextMenu(page, 'Mobile resize action long-press');
  await page.locator('.tcm.tcm--visible .tcm-item', { hasText: 'Resize Column' }).click();
  await page.waitForFunction(() => document.body.classList.contains('table-resize-mode'), null, { timeout: 5000 });

  const readMetrics = () => page.evaluate(() => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    return {
      cellWidth: Math.round(titleCellEl?.getBoundingClientRect().width || 0),
      headerWidth: Math.round(titleHeaderEl?.getBoundingClientRect().width || 0),
      resizeModeActive: document.body.classList.contains('table-resize-mode'),
      rowWidth: Math.round(titleRowEl?.getBoundingClientRect().width || 0),
      tableWidth: Math.round(tableEl?.getBoundingClientRect().width || 0)
    };
  });

  const beforeMetrics = await readMetrics();
  const resizeDelta = 72;
  await dragTouchLocator(page, titleHeader, {
    deltaX: resizeDelta,
    horizontalRatio: 0.5,
    steps: 8,
    verticalRatio: 0.5
  });

  await page.waitForFunction(({ expectedWidth }) => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    const headerWidth = Math.round(titleHeaderEl?.getBoundingClientRect().width || 0);
    const cellWidth = Math.round(titleCellEl?.getBoundingClientRect().width || 0);
    const rowWidth = Math.round(titleRowEl?.getBoundingClientRect().width || 0);
    const tableWidth = Math.round(tableEl?.getBoundingClientRect().width || 0);
    return Math.abs(headerWidth - expectedWidth) <= 4
      && Math.abs(headerWidth - cellWidth) <= 1
      && Math.abs(tableWidth - rowWidth) <= 1;
  }, { expectedWidth: beforeMetrics.headerWidth + resizeDelta }, { timeout: 5000 });

  const afterMetrics = await readMetrics();
  const actualDelta = afterMetrics.headerWidth - beforeMetrics.headerWidth;
  if (
    !beforeMetrics.resizeModeActive
    || !afterMetrics.resizeModeActive
    || Math.abs(actualDelta - resizeDelta) > 4
    || Math.abs(afterMetrics.headerWidth - afterMetrics.cellWidth) > 1
    || Math.abs(afterMetrics.tableWidth - afterMetrics.rowWidth) > 1
  ) {
    throw new Error(`Mobile column resize should drag from the active header with aligned cells: before=${JSON.stringify(beforeMetrics)}, after=${JSON.stringify(afterMetrics)}`);
  }

  await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    appServices.clearColumnResizeMode?.();
    appServices.setManualColumnWidth?.('Smoke Title', 96);
    appServices.renderVirtualTable?.();
  });
}

async function expectMobileFilterEditorSheet(page) {
  const filterGroup = page.locator('.fp-field-group', { hasText: 'Smoke Title' }).first();
  await filterGroup.waitFor({ state: 'visible', timeout: 5000 });
  await filterGroup.locator('.fp-edit-btn').first().click();
  await page.locator('#filter-card.show').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => !document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });

  const metrics = await page.locator('#filter-card.show').evaluate(card => {
    const rect = card.getBoundingClientRect();
    const close = card.querySelector('#filter-card-close-btn');
    const closeRect = close?.getBoundingClientRect();
    const operator = card.querySelector('#condition-operator-select');
    const input = card.querySelector('#condition-input');
    const conditionPanel = card.querySelector('#condition-panel');
    const clone = document.querySelector('.mobile-bubble-editor-clone');
    const active = document.activeElement;
    return {
      activeElementId: active?.id || '',
      activeElementTag: active?.tagName || '',
      bottom: rect.bottom,
      closeHeight: closeRect?.height || 0,
      closeWidth: closeRect?.width || 0,
      conditionPanelVisible: conditionPanel ? window.getComputedStyle(conditionPanel).display !== 'none' : false,
      inputFontSize: input ? Number.parseFloat(window.getComputedStyle(input).fontSize || '0') : 16,
      left: rect.left,
      mobilePanelOpen: document.body.classList.contains('mobile-filter-panel-open'),
      operatorFontSize: operator ? Number.parseFloat(window.getComputedStyle(operator).fontSize || '0') : 16,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      zoomCloneDisplay: clone ? window.getComputedStyle(clone).display : ''
    };
  });

  if (
    metrics.mobilePanelOpen
    || metrics.left < 4
    || metrics.right > metrics.viewportWidth - 4
    || metrics.top < 48
    || metrics.bottom > metrics.viewportHeight - 4
    || metrics.closeWidth < 44
    || metrics.closeHeight < 44
    || !metrics.conditionPanelVisible
    || metrics.operatorFontSize < 16
    || metrics.inputFontSize < 16
    || metrics.zoomCloneDisplay !== 'none'
    || ['condition-input', 'condition-input-2', 'condition-operator-select'].includes(metrics.activeElementId)
  ) {
    throw new Error(`Mobile filter editor should open as a contained sheet without focus zoom: ${JSON.stringify(metrics)}`);
  }

  await expectNoHorizontalOverflow(page, 'Mobile filter editor sheet');
  await expectMobileEditableFocusContained(page, '#filter-card.show #condition-input', '#filter-card', 'Mobile filter value input');
  await page.locator('#filter-card-close-btn').click();
  await page.waitForFunction(() => {
    return !document.querySelector('#filter-card')?.classList.contains('show')
      && !document.querySelector('#overlay')?.classList.contains('show')
      && !document.querySelector('.active-bubble, .bubble-clone');
  }, null, { timeout: 5000 });
}

async function expectEmptyTableMessage(page, expectedPattern, label) {
  await page.locator('#example-table tbody td').first().waitFor({ state: 'visible', timeout: 5000 });
  const message = (await page.locator('#example-table tbody td').first().textContent())?.trim() || '';
  if (!expectedPattern.test(message)) {
    throw new Error(`${label} expected empty table message ${expectedPattern}, received "${message}"`);
  }
}

async function expectResultsCount(page, expectedText, label) {
  await page.locator('#table-results-badge').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(expected => {
    return document.querySelector('#table-results-count')?.textContent?.trim() === expected;
  }, expectedText, { timeout: 5000 });

  const actualText = (await page.locator('#table-results-count').textContent())?.trim();
  if (actualText !== expectedText) {
    throw new Error(`${label} expected ${expectedText} results text, received ${actualText}`);
  }
}

async function expectPostFilterStats(page, expected, label) {
  try {
    await page.waitForFunction(async ({ filteredRows, hasPostFilters, totalRows }) => {
      const { appServices } = await import('./src/core/appServices.js');
      const stats = appServices.getPostFilterStats?.();
      return stats?.filteredRows === filteredRows
        && stats?.totalRows === totalRows
        && appServices.hasPostFilters?.() === hasPostFilters;
    }, expected, { timeout: 5000 });
  } catch (error) {
    const observed = await page.evaluate(async () => {
      const { appServices } = await import('./src/core/appServices.js');
      const stats = appServices.getPostFilterStats?.();
      return {
        filteredRows: stats?.filteredRows,
        hasPostFilters: appServices.hasPostFilters?.(),
        totalRows: stats?.totalRows
      };
    });
    throw new Error(`${label} expected ${JSON.stringify(expected)}, received ${JSON.stringify(observed)}: ${error.message}`);
  }

  const observed = await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const stats = appServices.getPostFilterStats?.();
    return {
      filteredRows: stats?.filteredRows,
      hasPostFilters: appServices.hasPostFilters?.(),
      totalRows: stats?.totalRows
    };
  });

  if (
    observed.filteredRows !== expected.filteredRows
    || observed.totalRows !== expected.totalRows
    || observed.hasPostFilters !== expected.hasPostFilters
  ) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, received ${JSON.stringify(observed)}`);
  }
}

async function exerciseProjectedDuplicateCollapse(page) {
  await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const { QueryChangeManager } = await import('./src/core/queryState.js');
    const { QueryTableView } = await import('./src/ui/queryTableView.js');
    const { QueryUI } = await import('./src/ui/queryUI.js');
    const headers = ['Smoke Title', 'Smoke Branch', 'Smoke Item ID'];
    const rows = [
      ['Same title', 'Main', 'item-1'],
      ['Same title', 'Main', 'item-2'],
      ['Different title', 'East', 'item-3']
    ];
    QueryChangeManager.replaceDisplayedFields(headers, { source: 'BrowserSmoke.duplicateCollapse' });
    QueryChangeManager.setLifecycleState(
      { hasLoadedResultSet: true, queryRunning: false },
      { source: 'BrowserSmoke.duplicateCollapse', silent: true }
    );
    appServices.setVirtualTableData({
      headers,
      rows,
      columnMap: new Map(headers.map((header, index) => [header, index]))
    });
    await QueryTableView.showExampleTable(headers, { syncQueryState: false });
    QueryUI.updateButtonStates();
  });
  await expectResultsCount(page, '3', 'Desktop duplicate baseline with ID column');

  await page.evaluate(async () => {
    const { QueryChangeManager } = await import('./src/core/queryState.js');
    QueryChangeManager.replaceDisplayedFields(['Smoke Title', 'Smoke Branch'], {
      source: 'BrowserSmoke.duplicateCollapse.removeId'
    });
  });
  await expectResultsCount(page, '2 of 3', 'Desktop duplicate collapse after removing ID column');
  await page.waitForFunction(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const stats = appServices.getPostFilterStats?.();
    return stats?.duplicateRowsCollapsed === 1 && stats?.uniqueRows === 2 && stats?.postFilteredRows === 3;
  }, null, { timeout: 5000 });
  await page.locator('.app-toast', { hasText: '1 duplicate row collapsed for the current columns' })
    .waitFor({ state: 'visible', timeout: 5000 });

  await page.locator('#duplicate-rows-toggle').click();
  await expectResultsCount(page, '3', 'Desktop duplicate collapse disabled');
  await page.waitForFunction(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const stats = appServices.getPostFilterStats?.();
    return appServices.isDuplicateRowCollapseActive?.() === false
      && stats?.duplicateRowsCollapsed === 0
      && stats?.uniqueRows === 3
      && stats?.postFilteredRows === 3;
  }, null, { timeout: 5000 });

  await page.locator('#duplicate-rows-toggle').click();
  await expectResultsCount(page, '2 of 3', 'Desktop duplicate collapse re-enabled');
  await page.waitForFunction(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const stats = appServices.getPostFilterStats?.();
    return appServices.isDuplicateRowCollapseActive?.() === true
      && stats?.duplicateRowsCollapsed === 1
      && stats?.uniqueRows === 2
      && stats?.postFilteredRows === 3;
  }, null, { timeout: 5000 });
}

async function exerciseCoreFilterStateInteraction(page) {
  await page.evaluate(async () => {
    const { AppState, QueryChangeManager } = await import('./src/core/queryState.js');
    const { FilterSidePanel } = await import('./src/features/filters/filterSidePanel.js');
    const { fieldDefs, fieldDefsArray, filteredDefs } = await import('./src/features/filters/fieldDefs.js');
    const fieldDef = {
      name: 'Smoke Filter Field',
      category: 'Smoke',
      desc: 'Browser interaction coverage field',
      filters: ['equals', 'contains'],
      type: 'string'
    };

    fieldDefs.set(fieldDef.name, fieldDef);
    const existingIndex = fieldDefsArray.findIndex(field => field?.name === fieldDef.name);
    if (existingIndex >= 0) {
      fieldDefsArray.splice(existingIndex, 1);
    }
    fieldDefsArray.unshift(fieldDef);
    filteredDefs.splice(0, filteredDefs.length, fieldDef);
    AppState.currentCategory = 'All';

    QueryChangeManager.setQueryState({
      displayedFields: [],
      activeFilters: {
        [fieldDef.name]: {
          filters: [
            { cond: 'equals', val: 'Smoke Value' }
          ]
        }
      }
    }, { source: 'BrowserSmoke.coreFilterStateInteraction' });

    FilterSidePanel.update();
  });

  await page.locator('.fp-cond-text', { hasText: 'Smoke Value' }).waitFor({ state: 'attached', timeout: 5000 });
}

async function exerciseFieldPickerPreviewList(page) {
  await page.evaluate(async () => {
    const { SharedFieldPicker } = await import('./src/ui/field-picker/fieldPicker.js');
    await SharedFieldPicker.open({
      getOptions: () => [
        { name: 'Preview Smoke Title', type: 'text', filterable: true, category: 'Smoke' },
        { name: 'Preview Smoke Description Match', type: 'text', filterable: true, category: 'Smoke', description: 'Preview Smoke Branch appears here' },
        { name: 'Preview Smoke Branch', type: 'text', filterable: true, category: 'Smoke' },
        { name: 'Preview Smoke Status', type: 'text', filterable: true, category: 'Smoke' }
      ],
      getFieldState: () => ({ display: false, filter: false }),
      labels: {
        description: 'Choose a field for preview-list smoke coverage.',
        footerNote: 'Smoke test field picker preview list.'
      },
      renderFilterPreview(container, fieldName) {
        const preview = document.createElement('div');
        preview.className = 'field-picker-preview-smoke';
        preview.textContent = `Preview controls for ${fieldName}`;
        container.replaceChildren(preview);

        return {
          getState: () => ({ fieldName, operator: 'equals', values: [] }),
          cleanup() {}
        };
      }
    });
  });

  const modal = page.locator('.form-mode-field-picker-modal:not(.hidden)');
  await modal.waitFor({ state: 'visible', timeout: 5000 });

  const optionCount = await modal.locator('.form-mode-field-picker-option').count();
  if (optionCount !== 4) {
    const listText = await modal.locator('.form-mode-field-picker-list').textContent();
    throw new Error(`Field picker with preview rendered ${optionCount} options instead of 4. List text: ${listText}`);
  }

  await modal.locator('.form-mode-field-picker-search').fill('Preview Smoke Branch');
  await page.waitForFunction(() => {
    const options = Array.from(document.querySelectorAll('.form-mode-field-picker-modal:not(.hidden) .form-mode-field-picker-option'));
    return options.length === 2 && /^Preview Smoke Branch/u.test((options[0].textContent || '').trim());
  }, null, { timeout: 5000 });

  await modal.locator('.form-mode-field-picker-close').click();
  await page.locator('.form-mode-field-picker-modal').waitFor({ state: 'detached', timeout: 5000 });
}

async function exerciseFormModeBuildableDisplayField(page) {
  await page.evaluate(async () => {
    const { QueryChangeManager } = await import('./src/core/queryState.js');
    const { QueryFormMode } = await import('./src/ui/form-mode/formMode.js');

    QueryChangeManager.replaceDisplayedFields(['Smoke Title'], {
      source: 'BrowserSmoke.seedBuildableFormMode'
    });
    await QueryFormMode.activateFromCurrentQuery();
  });

  const addFieldButton = page.locator('#form-mode-add-field');
  if (await addFieldButton.count() !== 1) {
    throw new Error('Form mode Add Field button was not available for buildable-field smoke test');
  }
  await addFieldButton.click();

  const modal = page.locator('.form-mode-field-picker-modal:not(.hidden)');
  await modal.waitFor({ state: 'visible', timeout: 5000 });
  await modal.locator('.form-mode-field-picker-search').fill('MARC Field');
  await page.waitForFunction(() => {
    const options = Array.from(document.querySelectorAll('.form-mode-field-picker-modal:not(.hidden) .form-mode-field-picker-option'));
    return options.some(option => option.dataset.fieldName === 'MARC Field');
  }, null, { timeout: 5000 });

  const marcOption = modal.locator('.form-mode-field-picker-option[data-field-name="MARC Field"]');
  if (await marcOption.count() !== 1) {
    throw new Error('Buildable MARC field option did not resolve to exactly one picker option');
  }
  await marcOption.click();

  const builderInputs = modal.locator('.form-mode-buildable-input');
  if (await builderInputs.count() !== 2) {
    throw new Error('Buildable MARC field should render tag and subfield builder inputs');
  }

  await modal.locator('.form-mode-buildable-input[data-input-id="tag"]').fill('590');
  const subfieldOptional = await modal.locator('.form-mode-buildable-input[data-input-id="subfield"]').evaluate(input => ({
    optional: input.dataset.optional,
    required: input.required
  }));
  if (subfieldOptional.optional !== 'true' || subfieldOptional.required) {
    throw new Error(`MARC subfield input should be optional: ${JSON.stringify(subfieldOptional)}`);
  }
  await modal.locator('button', { hasText: 'Create and display field' }).click();
  await page.locator('.form-mode-field-picker-modal').waitFor({ state: 'detached', timeout: 5000 });

  const state = await page.evaluate(async () => {
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    const { fieldDefs } = await import('./src/features/filters/fieldDefs.js');
    const dynamicDef = fieldDefs.get('MARC 590');
    return {
      displayedFields: QueryStateReaders.getDisplayedFields(),
      dynamicParent: dynamicDef?.dynamic_parent || null
    };
  });

  if (
    !state.displayedFields.includes('MARC 590')
    || state.displayedFields.includes('MARC Field')
    || state.dynamicParent !== 'MARC Field'
  ) {
    throw new Error(`Form mode should display the generated MARC field, not the raw placeholder: ${JSON.stringify(state)}`);
  }
}

async function exerciseTableBuildableDisplayField(page) {
  await page.evaluate(async () => {
    const { QueryChangeManager } = await import('./src/core/queryState.js');

    document.body.classList.remove('form-mode-active');
    QueryChangeManager.replaceDisplayedFields(['Smoke Title'], {
      source: 'BrowserSmoke.seedBuildableTable'
    });
  });

  const addFieldButton = page.locator('#table-add-field-btn');
  if (await addFieldButton.count() !== 1) {
    throw new Error('Table Add Field button was not available for buildable-field smoke test');
  }
  await addFieldButton.click();

  const modal = page.locator('.form-mode-field-picker-modal:not(.hidden)');
  await modal.waitFor({ state: 'visible', timeout: 5000 });
  await modal.locator('.form-mode-field-picker-search').fill('MARC Field');
  await page.waitForFunction(() => {
    const options = Array.from(document.querySelectorAll('.form-mode-field-picker-modal:not(.hidden) .form-mode-field-picker-option'));
    return options.some(option => option.dataset.fieldName === 'MARC Field');
  }, null, { timeout: 5000 });

  const marcOption = modal.locator('.form-mode-field-picker-option[data-field-name="MARC Field"]');
  if (await marcOption.count() !== 1) {
    throw new Error('Table buildable MARC field option did not resolve to exactly one picker option');
  }
  await marcOption.click();

  const builderInputs = modal.locator('.form-mode-buildable-input');
  if (await builderInputs.count() !== 2) {
    throw new Error('Table field picker should render buildable tag and subfield inputs');
  }

  const builderLabel = await modal.locator('.form-mode-field-picker-filter-preview-label').textContent();
  if (!/field builder/iu.test(builderLabel || '')) {
    throw new Error(`Buildable field detail panel should be labeled as a field builder: ${builderLabel}`);
  }

  await modal.locator('.form-mode-buildable-input[data-input-id="tag"]').fill('591');
  await modal.locator('button', { hasText: 'Create and add field' }).click();
  await page.locator('.form-mode-field-picker-modal').waitFor({ state: 'detached', timeout: 5000 });

  const state = await page.evaluate(async () => {
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    const { fieldDefs } = await import('./src/features/filters/fieldDefs.js');
    const dynamicDef = fieldDefs.get('MARC 591');
    return {
      displayedFields: QueryStateReaders.getDisplayedFields(),
      dynamicParent: dynamicDef?.dynamic_parent || null
    };
  });

  if (
    !state.displayedFields.includes('MARC 591')
    || state.displayedFields.includes('MARC Field')
    || state.dynamicParent !== 'MARC Field'
  ) {
    throw new Error(`Table picker should display the generated MARC field, not the raw placeholder: ${JSON.stringify(state)}`);
  }

  const persistedBeforeReload = await page.evaluate(async () => {
    const { DYNAMIC_FIELD_STORAGE_KEY } = await import('./src/features/filters/dynamicFieldStorage.js');
    const storedFields = JSON.parse(window.localStorage.getItem(DYNAMIC_FIELD_STORAGE_KEY) || '[]');
    return {
      storageKey: DYNAMIC_FIELD_STORAGE_KEY,
      storedFields
    };
  });
  if (!persistedBeforeReload.storedFields.some(field => field?.name === 'MARC 591')) {
    throw new Error(`Built field should be saved locally before reload: ${JSON.stringify(persistedBeforeReload)}`);
  }

  const reloadFailures = [];
  await page.reload({ waitUntil: 'load', timeout: 15000 });
  await waitForAppReady(page, reloadFailures);
  if (reloadFailures.length > 0) {
    throw new Error(`Reload after saving built field failed: ${reloadFailures.join('; ')}`);
  }

  const restoredState = await page.evaluate(async () => {
    const { fieldDefs, isLocalDynamicField } = await import('./src/features/filters/fieldDefs.js');
    return {
      hasField: fieldDefs.has('MARC 591'),
      localDynamic: isLocalDynamicField('MARC 591')
    };
  });
  if (!restoredState.hasField || !restoredState.localDynamic) {
    throw new Error(`Built field should restore from local storage after reload: ${JSON.stringify(restoredState)}`);
  }

  await page.locator('#table-add-field-btn').click();
  const removalModal = page.locator('.form-mode-field-picker-modal:not(.hidden)');
  await removalModal.waitFor({ state: 'visible', timeout: 5000 });
  await removalModal.locator('.form-mode-field-picker-search').fill('MARC 591');
  await page.waitForFunction(() => {
    return Boolean(document.querySelector('.form-mode-field-picker-modal:not(.hidden) .form-mode-field-picker-option[data-field-name="MARC 591"]'));
  }, null, { timeout: 5000 });
  await removalModal.locator('.form-mode-field-picker-option[data-field-name="MARC 591"]').click();
  const removeBuiltButton = removalModal.locator('[data-field-picker-remove-built]');
  await removeBuiltButton.waitFor({ state: 'visible', timeout: 5000 });
  await removeBuiltButton.click();

  const removedState = await page.evaluate(async () => {
    const { DYNAMIC_FIELD_STORAGE_KEY, readStoredDynamicFields } = await import('./src/features/filters/dynamicFieldStorage.js');
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    const { fieldDefs, isLocalDynamicField } = await import('./src/features/filters/fieldDefs.js');
    return {
      displayedFields: QueryStateReaders.getDisplayedFields(),
      hasField: fieldDefs.has('MARC 591'),
      localDynamic: isLocalDynamicField('MARC 591'),
      rawStorage: window.localStorage.getItem(DYNAMIC_FIELD_STORAGE_KEY),
      storedFields: readStoredDynamicFields()
    };
  });
  if (
    removedState.hasField
    || removedState.localDynamic
    || removedState.displayedFields.includes('MARC 591')
    || removedState.storedFields.some(field => field?.name === 'MARC 591')
  ) {
    throw new Error(`Removing a built field should clear field definitions, display state, and local storage: ${JSON.stringify(removedState)}`);
  }

  await page.locator('.form-mode-field-picker-close').click();
  await page.locator('.form-mode-field-picker-modal').waitFor({ state: 'detached', timeout: 5000 });
}

async function exerciseDesktopResultsWorkflow(page) {
  await exerciseProjectedDuplicateCollapse(page);
  await seedLoadedResults(page);
  await expectResultsCount(page, '3', 'Desktop seeded results');
  await expectPostFilterStats(page, {
    filteredRows: 3,
    hasPostFilters: false,
    totalRows: 3
  }, 'Desktop seeded post filter state');
  await expectSplitTogglePreferenceWithoutEligibleResults(page);

  const titleHeader = page.locator('#example-table th[data-sort-field="Smoke Title"]').first();
  await titleHeader.waitFor({ state: 'visible', timeout: 5000 });
  await titleHeader.click();
  await page.waitForFunction(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const state = appServices.getVirtualTableState?.();
    return state?.currentSortColumn === 'Smoke Title' && state?.currentSortDirection === 'asc';
  }, null, { timeout: 5000 });
  const ascIconText = (await titleHeader.locator('.sort-icon').textContent())?.trim();
  if (ascIconText !== '↑') {
    throw new Error(`Desktop sort header did not show ascending state: ${ascIconText}`);
  }

  await titleHeader.click();
  await page.waitForFunction(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const state = appServices.getVirtualTableState?.();
    return state?.currentSortColumn === 'Smoke Title' && state?.currentSortDirection === 'desc';
  }, null, { timeout: 5000 });
  const firstTitleCell = page.locator('#example-table tbody tr[data-row-index="0"] td[data-col-index="0"]').first();
  await firstTitleCell.waitFor({ state: 'visible', timeout: 5000 });
  const firstTitleText = (await firstTitleCell.textContent())?.trim();
  if (firstTitleText !== 'Gamma record') {
    throw new Error(`Desktop descending sort did not move Gamma record first: ${firstTitleText}`);
  }

  await page.evaluate(async () => {
    const { PostFilterSystem } = await import('./src/features/table/post-filters/postFilters.js');
    PostFilterSystem.openOverlayForField?.('Smoke Branch');
  });
  await page.locator('#post-filter-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  await expectElementWithinViewport(page, '#post-filter-overlay .post-filter-dialog', 'Desktop post filter dialog');
  await page.locator('#post-filter-field').selectOption('Smoke Branch');
  await page.locator('#post-filter-operator').selectOption('contains');
  await page.locator('#post-filter-value').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#post-filter-value').fill('Main');
  await page.locator('#post-filter-add-btn').click();
  await expectPostFilterStats(page, {
    filteredRows: 2,
    hasPostFilters: true,
    totalRows: 3
  }, 'Desktop applied post filter state');
  await expectResultsCount(page, '2 of 3', 'Desktop filtered results');
  await page.locator('#post-filter-list .post-filter-pill', { hasText: 'Main' }).waitFor({ state: 'visible', timeout: 5000 });

  await page.locator('#post-filter-clear-btn').click();
  await expectPostFilterStats(page, {
    filteredRows: 3,
    hasPostFilters: false,
    totalRows: 3
  }, 'Desktop cleared post filter state');
  await expectResultsCount(page, '3', 'Desktop restored results');

  await page.locator('#post-filter-field').selectOption('Smoke Branch');
  await page.locator('#post-filter-operator').selectOption('is_blank');
  const valuelessPostFilterMetrics = await page.locator('#post-filter-overlay').evaluate(overlay => {
    const valueHost = overlay.querySelector('#post-filter-value-picker-host');
    const valueInput = overlay.querySelector('#post-filter-value');
    const valueInput2 = overlay.querySelector('#post-filter-value-2');
    const displayOf = element => element ? window.getComputedStyle(element).display : '';
    return {
      valueHostHidden: valueHost?.classList.contains('hidden') || false,
      valueInputDisplay: displayOf(valueInput),
      valueInputHidden: valueInput?.classList.contains('hidden') || false,
      valueInput2Display: displayOf(valueInput2),
      valueInput2Hidden: valueInput2?.classList.contains('hidden') || false
    };
  });
  if (
    !valuelessPostFilterMetrics.valueHostHidden
    || valuelessPostFilterMetrics.valueInputDisplay !== 'none'
    || !valuelessPostFilterMetrics.valueInputHidden
    || valuelessPostFilterMetrics.valueInput2Display !== 'none'
    || !valuelessPostFilterMetrics.valueInput2Hidden
  ) {
    throw new Error(`Valueless post filter operators should hide value controls: ${JSON.stringify(valuelessPostFilterMetrics)}`);
  }
  await page.locator('#post-filter-add-btn').click();
  await expectPostFilterStats(page, {
    filteredRows: 0,
    hasPostFilters: true,
    totalRows: 3
  }, 'Desktop valueless post filter state');
  await expectEmptyTableMessage(page, /No rows match the active post filters\./u, 'Desktop blank post filter empty table');
  await page.locator('#post-filter-list .post-filter-pill', { hasText: 'Is blank' }).waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#post-filter-clear-btn').click();
  await expectPostFilterStats(page, {
    filteredRows: 3,
    hasPostFilters: false,
    totalRows: 3
  }, 'Desktop cleared valueless post filter state');

  await page.locator('#post-filter-done-btn').click();
  await page.locator('#post-filter-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });

  await seedLoadedResults(page, { includeMultiValueBranch: true });
  await expectSplitTogglePreviewAnimation(page);
  await page.evaluate(async () => {
    const { PostFilterSystem } = await import('./src/features/table/post-filters/postFilters.js');
    PostFilterSystem.openOverlayForField?.('Smoke Branch');
  });
  await page.locator('#post-filter-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#post-filter-field').selectOption('Smoke Branch');
  await page.locator('#post-filter-operator').selectOption('has_multiple_values');
  await page.locator('#post-filter-add-btn').click();
  await expectPostFilterStats(page, {
    filteredRows: 1,
    hasPostFilters: true,
    totalRows: 3
  }, 'Desktop multi-value post filter state');
  await expectResultsCount(page, '1 of 3', 'Desktop multi-value filtered results');
  await page.locator('#post-filter-list .post-filter-pill', { hasText: 'Has multiple values' }).waitFor({ state: 'visible', timeout: 5000 });

  await page.locator('#post-filter-clear-btn').click();
  await expectPostFilterStats(page, {
    filteredRows: 3,
    hasPostFilters: false,
    totalRows: 3
  }, 'Desktop cleared multi-value post filter state');
  await page.locator('#post-filter-field').selectOption('Smoke Branch');
  await page.locator('#post-filter-operator').selectOption('does_not_have_multiple_values');
  await page.locator('#post-filter-add-btn').click();
  await expectPostFilterStats(page, {
    filteredRows: 2,
    hasPostFilters: true,
    totalRows: 3
  }, 'Desktop not-multi-value post filter state');
  await page.locator('#post-filter-list .post-filter-pill', { hasText: 'Does not have multiple values' }).waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#post-filter-clear-btn').click();
  await expectPostFilterStats(page, {
    filteredRows: 3,
    hasPostFilters: false,
    totalRows: 3
  }, 'Desktop cleared not-multi-value post filter state');

  await page.locator('#post-filter-done-btn').click();
  await page.locator('#post-filter-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });

  await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    appServices.setSplitColumnsMode(true);
  });
  await page.locator('#example-table th[data-sort-field="Smoke Branch 2"]').waitFor({ state: 'visible', timeout: 5000 });
  await openDesktopTableContextMenu(
    page,
    '#example-table th[data-sort-field="Smoke Branch 2"]',
    'Desktop split column header'
  );
  const splitColumnMenuHints = await page.locator('.tcm.tcm--visible .tcm-item').evaluateAll(items => {
    return items.map(item => ({
      hint: item.querySelector('.tcm-hint')?.textContent?.trim() || '',
      label: item.querySelector('.tcm-label')?.textContent?.trim() || ''
    }));
  });
  ['Add Filter', 'Add Post Filter'].forEach(label => {
    const item = splitColumnMenuHints.find(entry => entry.label === label);
    if (!item || item.hint !== 'Smoke Branch') {
      throw new Error(`Split column context menu should target parent field for "${label}": ${JSON.stringify(splitColumnMenuHints)}`);
    }
  });
  for (const label of ['Add Filter', 'Add Post Filter']) {
    await page.locator('.tcm.tcm--visible .tcm-item', { hasText: label }).hover();
    const previewState = await page.evaluate(() => ({
      bodyColumns: Array.from(document.querySelectorAll('#example-table tbody td.tcm-preview-column'))
        .map(cell => cell.dataset.colIndex)
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort(),
      headerColumns: Array.from(document.querySelectorAll('#example-table thead th.tcm-preview-column-header'))
        .map(header => header.dataset.colIndex)
        .sort()
    }));
    if (
      previewState.headerColumns.join('|') !== '1|2'
      || previewState.bodyColumns.join('|') !== '1|2'
    ) {
      throw new Error(`Split column context menu should preview the whole group for "${label}": ${JSON.stringify(previewState)}`);
    }
  }
  await page.locator('.tcm.tcm--visible .tcm-item', { hasText: 'Add Post Filter' }).click();
  await page.locator('#post-filter-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  const splitPostFilterState = await page.locator('#post-filter-field').evaluate(select => ({
    options: Array.from(select.options).map(option => option.value),
    value: select.value
  }));
  if (
    splitPostFilterState.value !== 'Smoke Branch'
    || splitPostFilterState.options.includes('Smoke Branch 1')
    || splitPostFilterState.options.includes('Smoke Branch 2')
  ) {
    throw new Error(`Split column post filter overlay should use the parent field only: ${JSON.stringify(splitPostFilterState)}`);
  }
  await page.locator('#post-filter-done-btn').click();
  await page.locator('#post-filter-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });
  await page.evaluate(async () => {
    const { dragDropColumnOps } = await import('./src/features/table/drag-drop/dragDropColumns.js');
    dragDropColumnOps.moveColumn(document.querySelector('#example-table'), 2, 3);
  });
  await page.waitForFunction(async () => {
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    return QueryStateReaders.getDisplayedFields().join('|') === 'Smoke Title|Smoke Status|Smoke Branch 1|Smoke Branch 2';
  }, null, { timeout: 5000 });
  await page.evaluate(async () => {
    const { dragDropColumnOps } = await import('./src/features/table/drag-drop/dragDropColumns.js');
    dragDropColumnOps.moveColumn(document.querySelector('#example-table'), 2, 0);
  });
  await page.waitForFunction(async () => {
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    return QueryStateReaders.getDisplayedFields().join('|') === 'Smoke Branch 1|Smoke Branch 2|Smoke Title|Smoke Status';
  }, null, { timeout: 5000 });
  await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    appServices.setSplitColumnsMode(false);
  });

  await seedLoadedResults(page, { includeDate: true });
  await page.locator('#download-btn').scrollIntoViewIfNeeded();
  const downloadDisabled = await page.locator('#download-btn').evaluate(button => button.disabled);
  if (downloadDisabled) {
    throw new Error('Download button is disabled after desktop result interactions');
  }
  await openExportOverlayPromptly(page, '#download-btn', 'Desktop download button');
  await expectElementWithinViewport(page, '#export-overlay .export-dialog', 'Desktop export dialog');
  await waitForExportOptionsReady(page, 'Desktop export dialog');
  const detailsSheetDefaultChecked = await page.locator('#export-include-run-details-sheet').isChecked();
  if (detailsSheetDefaultChecked) {
    throw new Error('Run details export sheet should be off by default');
  }
  await waitForGroupedExportAvailable(page, 'Desktop export dialog');
  await page.locator('[data-export-mode-card="grouped"]').click();
  await page.waitForFunction(() => {
    return /grouped sheet/iu.test(document.querySelector('#export-group-preview')?.textContent || '');
  }, null, { timeout: 5000 });
  await page.locator('#export-include-run-details-sheet').check();
  const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.locator('#export-confirm-btn').click();
  await page.locator('#export-progress:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => {
    return /Packaging workbook|Starting download|Building workbook/iu.test(document.querySelector('#export-progress')?.textContent || '');
  }, null, { timeout: 5000 });
  const download = await downloadPromise;
  const workbookEntries = await readWorkbookDownloadEntries(download);
  await download?.delete().catch(() => {});
  const allResultsSheetId = getWorkbookSheetId(workbookEntries, 'All Results');
  const overviewSheetId = getWorkbookSheetId(workbookEntries, 'Overview');
  const runDetailsSheetId = getWorkbookSheetId(workbookEntries, 'Run Details');
  const allResultsSheetXml = extractZipEntryText(workbookEntries, `xl/worksheets/sheet${allResultsSheetId}.xml`);
  const overviewSheetXml = extractZipEntryText(workbookEntries, `xl/worksheets/sheet${overviewSheetId}.xml`);
  const runDetailsSheetXml = extractZipEntryText(workbookEntries, `xl/worksheets/sheet${runDetailsSheetId}.xml`);
  const overviewTableXml = extractZipEntryText(workbookEntries, `xl/tables/table${overviewSheetId}.xml`);
  const overviewRows = parseSheetRows(overviewSheetXml);
  const allResultsTableXml = extractZipEntryText(workbookEntries, `xl/tables/table${allResultsSheetId}.xml`);
  const allResultsColumns = getTableColumns(allResultsTableXml);
  const dateColumnIndex = allResultsColumns.indexOf('Smoke Due Date') + 1;
  const dateColumnName = getColumnName(dateColumnIndex);
  const stylesXml = extractZipEntryText(workbookEntries, 'xl/styles.xml');
  const dateStyleId = getCellStyleId(allResultsSheetXml, `${dateColumnName}2`);
  const neverDateStyleId = getCellStyleId(allResultsSheetXml, `${dateColumnName}3`);
  const percentStyleId = getCellStyleId(overviewSheetXml, 'C2');
  const overviewMetrics = {
    dateColumnAlignment: /horizontal="right"/u.test(getStyleXml(stylesXml, dateStyleId)) ? 'right' : '',
    headers: getTableColumns(overviewTableXml),
    neverDateCellAlignment: /horizontal="right"/u.test(getStyleXml(stylesXml, neverDateStyleId)) ? 'right' : '',
    percentFormat: /numFmtId="10"/u.test(getStyleXml(stylesXml, percentStyleId)) ? '0.00%' : '',
    rowCount: overviewRows.length,
    runDetailsRows: parseSheetRows(runDetailsSheetXml),
    totalRow: overviewRows.find(row => row[0] === 'Total')
  };
  if (
    overviewMetrics.headers.join('|') !== 'Smoke Branch|Rows|Percent of Total'
    || overviewMetrics.rowCount !== 3
    || overviewMetrics.totalRow?.[1] !== 3
    || overviewMetrics.totalRow?.[2] !== 1
    || overviewMetrics.dateColumnAlignment !== 'right'
    || overviewMetrics.neverDateCellAlignment !== 'right'
    || overviewMetrics.percentFormat !== '0.00%'
    || !overviewMetrics.runDetailsRows.some(row => row.join('|') === 'Export|Mode|Split into sheets')
    || !overviewMetrics.runDetailsRows.some(row => row.join('|') === 'Displayed Fields|Count|4')
  ) {
    throw new Error(`Grouped export overview should include percentages and a total row: ${JSON.stringify(overviewMetrics)}`);
  }
  await page.locator('#export-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });

  await seedLargeExportResults(page);
  await page.locator('#download-btn').scrollIntoViewIfNeeded();
  await openExportOverlayPromptly(page, '#download-btn', 'Large desktop download button');
  await waitForExportOptionsReady(page, 'Large desktop export dialog');
  const largeDownloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await installHiddenTabNotificationSpy(page);
  await page.locator('#export-confirm-btn').click();
  await page.waitForFunction(() => {
    const progressText = document.querySelector('#export-progress')?.textContent || '';
    const overlayClosed = document.querySelector('#export-overlay')?.classList.contains('hidden') || false;
    const exportFinished = (window.__browserSmokeNotifications || []).some(notification => notification.title === 'Excel export finished');
    return /Building workbook|Writing [\d,]+ rows to Excel/iu.test(progressText) || overlayClosed || exportFinished;
  }, null, { timeout: 10000 });
  const largeDownload = await largeDownloadPromise;
  await largeDownload?.delete().catch(() => {});
  await page.locator('#export-overlay.hidden').waitFor({ state: 'attached', timeout: 10000 });
  const exportNotifications = await page.evaluate(() => window.__browserSmokeNotifications || []);
  await restoreVisibleTabNotificationSpy(page);
  if (!exportNotifications.some(notification => (
    notification.title === 'Excel export finished'
    && /\.xlsx is ready\.$/u.test(notification.options?.body || '')
    && notification.options?.tag === 'query-workbook-export'
  ))) {
    throw new Error(`Hidden-tab large export should send completion notification: ${JSON.stringify(exportNotifications)}`);
  }
}

async function exerciseZeroResultQueryWorkflow(page, queryApiStub) {
  await seedLoadedResults(page);
  await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const { QueryUI } = await import('./src/ui/queryUI.js');
    appServices.replacePostFilters({
      'Smoke Branch': {
        logic: 'all',
        filters: [
          { cond: 'equals', val: 'Main', vals: ['Main'] }
        ]
      }
    }, { refreshView: true, notify: true, resetScroll: true });
    QueryUI.updateButtonStates();
  });
  await expectPostFilterStats(page, {
    filteredRows: 2,
    hasPostFilters: true,
    totalRows: 3
  }, 'Desktop pre-run post filter state');
  await page.evaluate(async () => {
    const { encodeResultViewState } = await import('./src/core/resultViewState.js');
    const { rememberOpenedHistoryResult } = await import('./src/features/history/results/queryHistoryResultSession.js');
    rememberOpenedHistoryResult('browser-smoke-stale-result', {
      resultViewParam: encodeResultViewState({
        displayedFields: ['Smoke Status', 'Smoke Title'],
        fieldSearch: 'stale',
        postFilters: {
          'Smoke Branch': {
            logic: 'all',
            filters: [{ cond: 'equals', val: 'Main', vals: ['Main'] }]
          }
        },
        splitColumns: true
      }),
      updateUrl: true
    });
  });
  const staleResultUrlState = await page.evaluate(() => ({
    remembered: JSON.parse(window.localStorage.getItem('query:lastOpenedHistoryResult') || 'null'),
    result: new URL(window.location.href).searchParams.get('result'),
    resultView: new URL(window.location.href).searchParams.get('resultView')
  }));
  if (
    staleResultUrlState.result !== 'browser-smoke-stale-result'
    || !staleResultUrlState.resultView
    || staleResultUrlState.remembered?.queryId !== 'browser-smoke-stale-result'
  ) {
    throw new Error(`Smoke setup should start from a stale opened result URL: ${JSON.stringify(staleResultUrlState)}`);
  }

  queryApiStub.enqueue([
    {
      action: 'run',
      body: buildJsonlResultStream({
        queryId: 'browser-smoke-zero-results',
        rows: []
      }),
      contentType: 'application/x-ndjson; charset=utf-8',
      delayMs: 300,
      queryId: 'browser-smoke-zero-results',
      rawColumns: smokeResultHeaders
    }
  ]);

  await page.locator('#run-query-btn').click();
  await page.waitForFunction(async () => {
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    return QueryStateReaders.getLifecycleState().queryRunning === true;
  }, null, { timeout: 5000 });
  const inFlightRunUrlState = await page.evaluate(() => ({
    remembered: window.localStorage.getItem('query:lastOpenedHistoryResult'),
    result: new URL(window.location.href).searchParams.get('result'),
    resultView: new URL(window.location.href).searchParams.get('resultView')
  }));
  if (
    inFlightRunUrlState.result !== null
    || inFlightRunUrlState.resultView !== null
    || inFlightRunUrlState.remembered !== null
  ) {
    throw new Error(`Starting a new query should clear stale opened-result restore state: ${JSON.stringify(inFlightRunUrlState)}`);
  }
  await page.waitForFunction(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    const lifecycle = QueryStateReaders.getLifecycleState();
    const tableData = appServices.getVirtualTableData?.();
    return lifecycle.queryRunning === false
      && lifecycle.hasLoadedResultSet === true
      && lifecycle.currentQueryId === 'browser-smoke-zero-results'
      && Array.isArray(tableData?.rows)
      && tableData.rows.length === 0;
  }, null, { timeout: 10000 });
  let completedRunUrlState = null;
  const completedRunUrlWaitStart = Date.now();
  while (Date.now() - completedRunUrlWaitStart < 5000) {
    completedRunUrlState = await page.evaluate(async () => {
      const {
        RESULT_VIEW_URL_PARAM,
        decodeResultViewStateParam
      } = await import('./src/core/resultViewState.js');
      const url = new URL(window.location.href);
      const resultView = decodeResultViewStateParam(url.searchParams.get(RESULT_VIEW_URL_PARAM));
      return {
        remembered: JSON.parse(window.localStorage.getItem('query:lastOpenedHistoryResult') || 'null'),
        result: url.searchParams.get('result'),
        resultView
      };
    });
    if (completedRunUrlState.result === 'browser-smoke-zero-results') {
      break;
    }
    await page.waitForTimeout(50);
  }
  if (
    completedRunUrlState?.result !== 'browser-smoke-zero-results'
    || completedRunUrlState?.remembered?.queryId !== 'browser-smoke-zero-results'
    || completedRunUrlState?.resultView?.fieldSearch === 'stale'
    || completedRunUrlState?.resultView?.postFilters?.['Smoke Branch']
  ) {
    throw new Error(`Completed new query should publish fresh result URL state only: ${JSON.stringify(completedRunUrlState)}`);
  }

  await expectPostFilterStats(page, {
    filteredRows: 0,
    hasPostFilters: false,
    totalRows: 0
  }, 'Desktop post-filter state after zero-result query');
  await expectResultsCount(page, '0', 'Desktop zero-result query');
  await expectEmptyTableMessage(page, /no results matched this query/iu, 'Desktop zero-result query');

  const queryStatus = await page.evaluate(async () => {
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    return QueryStateReaders.getQueryStatus();
  });
  if (queryStatus !== 'results') {
    throw new Error(`Zero-result query should be treated as loaded results, received query status "${queryStatus}"`);
  }

  const isPlanningMode = await page.evaluate(() => document.body.classList.contains('is-planning'));
  if (isPlanningMode) {
    throw new Error('Zero-result query left the UI in planning mode');
  }
}

async function exerciseJsonResultPayloadWorkflow(page, queryApiStub) {
  const longSmokeTitle = 'JSON Alpha with an intentionally long title that should be clipped in the virtual table cell but remain fully readable in the value viewer';

  await page.evaluate(async () => {
    const { QueryChangeManager } = await import('./src/core/queryState.js');
    const { QueryUI } = await import('./src/ui/queryUI.js');
    await QueryChangeManager.clearQuery({ source: 'BrowserSmoke.jsonResultPayloadSetup' });
    QueryChangeManager.replaceDisplayedFields(['Smoke Title', 'Public Note', 'MARC 590'], {
      source: 'BrowserSmoke.jsonResultPayloadSetup'
    });
    QueryUI.updateButtonStates();
  });

  queryApiStub.enqueue({
    action: 'run',
    body: buildJsonlResultStream({
      columns: ['Smoke Title', 'Public Note', 'MARC 590'],
      queryId: 'browser-smoke-json-results',
      rows: [
        [
          longSmokeTitle,
          ['First public note', 'Second public note', 'Third public note'],
          [
            '$a MSU -- Ulysses S. Grant Association.',
            '$a MSU -- Gift of Marcia Ewing-Current.',
            '$a MSU -- Richard Current Collection.'
          ]
        ],
        ['JSON Beta', ['Only public note'], ['$a Single local note']]
      ]
    }),
    contentType: 'application/x-ndjson; charset=utf-8',
    queryId: 'browser-smoke-json-results'
  });

  await page.locator('#run-query-btn').click();
  await expectResultsCount(page, '2', 'Desktop JSONL result stream');

  const jsonResultState = await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    const tableData = appServices.getVirtualTableData?.();
    return {
      lifecycle: QueryStateReaders.getLifecycleState(),
      rows: tableData?.rows || []
    };
  });

  if (
    jsonResultState.lifecycle.currentQueryId !== 'browser-smoke-json-results'
    || JSON.stringify(jsonResultState.rows[0]?.[1]) !== JSON.stringify(['First public note', 'Second public note', 'Third public note'])
    || JSON.stringify(jsonResultState.rows[0]?.[2]) !== JSON.stringify([
      '$a MSU -- Ulysses S. Grant Association.',
      '$a MSU -- Gift of Marcia Ewing-Current.',
      '$a MSU -- Richard Current Collection.'
    ])
  ) {
    throw new Error(`JSONL result stream should hydrate multi-value arrays: ${JSON.stringify(jsonResultState)}`);
  }

  await page.evaluate(() => {
    window.__browserSmokeCopiedText = '';
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          async writeText(text) {
            window.__browserSmokeCopiedText = String(text || '');
          }
        }
      });
    } catch {
      document.execCommand = () => {
        window.__browserSmokeCopiedText = document.activeElement?.value || '';
        return true;
      };
    }
  });

  async function assertTruncatedCellViewer({ cellSelector, expectedField, expectedValue, label }) {
    const compactCellMetrics = await page.locator(cellSelector).evaluate(cell => {
      const trigger = cell.querySelector('.query-table-truncated-trigger');
      const text = cell.querySelector('.query-table-truncated-text');
      const textStyle = text ? window.getComputedStyle(text) : null;
      return {
        dataFullCellValue: cell.getAttribute('data-full-cell-value') || cell.dataset.fullCellValue || '',
        hasTrigger: Boolean(trigger),
        isEllipsized: Boolean(text && text.scrollWidth - text.clientWidth > 1),
        textOverflow: textStyle?.textOverflow || '',
        triggerLabel: trigger?.getAttribute('aria-label') || ''
      };
    });

    if (
      !compactCellMetrics.hasTrigger
      || compactCellMetrics.dataFullCellValue !== expectedValue
      || !compactCellMetrics.isEllipsized
      || compactCellMetrics.textOverflow !== 'ellipsis'
      || !compactCellMetrics.triggerLabel.includes(expectedField)
    ) {
      throw new Error(`${label} should render as a clickable ellipsized cell: ${JSON.stringify(compactCellMetrics)}`);
    }

    await page.locator(`${cellSelector} .query-table-truncated-trigger`).click();
    await page.locator('.query-multi-value-viewer').waitFor({ state: 'visible', timeout: 5000 });

    const viewerState = await page.locator('.query-multi-value-viewer').evaluate(viewer => ({
      bodyLocked: document.body.classList.contains('multi-value-viewer-open'),
      copyLabel: viewer.querySelector('.query-multi-value-viewer__copy')?.textContent?.trim() || '',
      eyebrow: viewer.querySelector('.query-multi-value-viewer__eyebrow')?.textContent?.trim() || '',
      title: viewer.querySelector('.query-multi-value-viewer__title')?.textContent?.trim() || '',
      values: Array.from(viewer.querySelectorAll('.query-multi-value-viewer__value'))
        .map(node => node.textContent?.trim())
        .filter(Boolean)
    }));

    if (
      !viewerState.bodyLocked
      || viewerState.title !== expectedField
      || viewerState.eyebrow !== 'Full value'
      || viewerState.copyLabel !== 'Copy value'
      || viewerState.values.join('|') !== expectedValue
    ) {
      throw new Error(`${label} viewer did not show the full value: ${JSON.stringify(viewerState)}`);
    }

    await page.locator('.query-multi-value-viewer__copy').click();
    const copiedText = await page.evaluate(() => window.__browserSmokeCopiedText || '');
    if (copiedText !== expectedValue) {
      throw new Error(`${label} Copy value should copy the full value: ${JSON.stringify(copiedText)}`);
    }

    await page.locator('.query-multi-value-viewer__close').click();
    await page.locator('.query-multi-value-viewer').waitFor({ state: 'detached', timeout: 5000 });
  }

  await assertTruncatedCellViewer({
    cellSelector: '#example-table tbody tr[data-row-index="0"] td[data-col-index="0"]',
    expectedField: 'Smoke Title',
    expectedValue: longSmokeTitle,
    label: 'JSON long Smoke Title cell'
  });

  async function assertMultiValueViewer({ cellSelector, expectedField, expectedValues, label }) {
    const compactCellMetrics = await page.locator(cellSelector).evaluate(cell => ({
      hasTrigger: Boolean(cell.querySelector('.query-table-multi-value-trigger')),
      text: cell.textContent?.replace(/\s+/gu, ' ').trim() || ''
    }));

    if (
      !compactCellMetrics.hasTrigger
      || !compactCellMetrics.text.includes(expectedValues[0])
      || compactCellMetrics.text.includes(expectedValues[1])
      || !compactCellMetrics.text.includes(`${expectedValues.length} values`)
    ) {
      throw new Error(`${label} should show a compact multi-value cell: ${JSON.stringify(compactCellMetrics)}`);
    }

    await page.locator(`${cellSelector} .query-table-multi-value-trigger`).click();
    await page.locator('.query-multi-value-viewer').waitFor({ state: 'visible', timeout: 5000 });

    const viewerState = await page.locator('.query-multi-value-viewer').evaluate(viewer => ({
      bodyLocked: document.body.classList.contains('multi-value-viewer-open'),
      title: viewer.querySelector('.query-multi-value-viewer__title')?.textContent?.trim() || '',
      values: Array.from(viewer.querySelectorAll('.query-multi-value-viewer__value'))
        .map(node => node.textContent?.trim())
        .filter(Boolean)
    }));

    if (
      !viewerState.bodyLocked
      || viewerState.title !== expectedField
      || viewerState.values.join('|') !== expectedValues.join('|')
    ) {
      throw new Error(`${label} viewer did not show all values: ${JSON.stringify(viewerState)}`);
    }

    await page.locator('.query-multi-value-viewer__copy').click();
    const copiedText = await page.evaluate(() => window.__browserSmokeCopiedText || '');
    if (copiedText !== expectedValues.join('\n')) {
      throw new Error(`${label} Copy all should copy newline-separated values: ${JSON.stringify(copiedText)}`);
    }

    await page.locator('.query-multi-value-viewer__close').click();
    await page.locator('.query-multi-value-viewer').waitFor({ state: 'detached', timeout: 5000 });
  }

  await assertMultiValueViewer({
    cellSelector: '#example-table tbody tr[data-row-index="0"] td[data-col-index="1"]',
    expectedField: 'Public Note',
    expectedValues: ['First public note', 'Second public note', 'Third public note'],
    label: 'JSON multi-value Public Note cell'
  });

  await assertMultiValueViewer({
    cellSelector: '#example-table tbody tr[data-row-index="0"] td[data-col-index="2"]',
    expectedField: 'MARC 590',
    expectedValues: [
      '$a MSU -- Ulysses S. Grant Association.',
      '$a MSU -- Gift of Marcia Ewing-Current.',
      '$a MSU -- Richard Current Collection.'
    ],
    label: 'JSON multi-value MARC cell'
  });
}

async function expectCustomDatePickerNeverOption(page) {
  await page.evaluate(async () => {
    document.querySelector('[data-browser-smoke-date-picker-host]')?.remove();
    const { CustomDatePicker } = await import('./src/ui/controls/customDatePicker.js');
    const host = document.createElement('div');
    host.setAttribute('data-browser-smoke-date-picker-host', '');
    host.style.position = 'fixed';
    host.style.left = '24px';
    host.style.top = '24px';
    host.style.zIndex = '9999';
    const input = document.createElement('input');
    input.id = 'browser-smoke-never-date-input';
    host.appendChild(input);
    document.body.appendChild(host);
    CustomDatePicker.enhanceInput(input, {
      enabled: true,
      placeholder: 'M/D/YYYY',
      variant: 'filter'
    });
  });

  const input = page.locator('#browser-smoke-never-date-input');
  await input.click();
  await page.locator('.custom-date-picker [data-date-action="never"]').click();
  const metrics = await input.evaluate(element => ({
    errorMessage: element.dataset.errorMsg || '',
    pattern: element.getAttribute('pattern') || '',
    value: element.value
  }));
  await page.evaluate(async () => {
    const { CustomDatePicker } = await import('./src/ui/controls/customDatePicker.js');
    CustomDatePicker.close();
    document.querySelector('[data-browser-smoke-date-picker-host]')?.remove();
  });

  if (metrics.value !== 'Never' || !metrics.pattern.includes('Never') || !/Never/u.test(metrics.errorMessage)) {
    throw new Error(`Custom date picker should expose Never as a date value: ${JSON.stringify(metrics)}`);
  }

  await page.evaluate(async () => {
    document.querySelector('[data-browser-smoke-date-picker-host]')?.remove();
    const { CustomDatePicker } = await import('./src/ui/controls/customDatePicker.js');
    const host = document.createElement('div');
    host.setAttribute('data-browser-smoke-date-picker-host', '');
    host.style.position = 'fixed';
    host.style.left = '24px';
    host.style.top = '24px';
    host.style.zIndex = '9999';
    const input = document.createElement('input');
    input.id = 'browser-smoke-no-never-date-input';
    host.appendChild(input);
    document.body.appendChild(host);
    CustomDatePicker.enhanceInput(input, {
      allowNever: false,
      enabled: true,
      placeholder: 'M/D/YYYY',
      variant: 'filter'
    });
  });

  await page.locator('#browser-smoke-no-never-date-input').click();
  const neverHidden = await page.locator('.custom-date-picker [data-date-action="never"]').evaluate(button => {
    return button.hidden || button.disabled || window.getComputedStyle(button).display === 'none';
  });
  await page.evaluate(async () => {
    const { CustomDatePicker } = await import('./src/ui/controls/customDatePicker.js');
    CustomDatePicker.close();
    document.querySelector('[data-browser-smoke-date-picker-host]')?.remove();
  });
  if (!neverHidden) {
    throw new Error('Custom date picker should hide Never when the active date operator cannot use it');
  }
}

async function exerciseFormModeDateTypingCommit(page) {
  await page.evaluate(async () => {
    const { QueryChangeManager } = await import('./src/core/queryState.js');
    const { QueryFormMode } = await import('./src/ui/form-mode/formMode.js');
    const { fieldDefs, fieldDefsArray, filteredDefs } = await import('./src/features/filters/fieldDefs.js');
    const dateField = {
      name: 'Smoke Due Date',
      category: 'Smoke',
      desc: 'Smoke-test due date field',
      filters: ['equals', 'before', 'after', 'between'],
      type: 'date'
    };

    fieldDefs.set(dateField.name, dateField);
    if (!fieldDefsArray.some(field => field?.name === dateField.name)) fieldDefsArray.push(dateField);
    if (!filteredDefs.some(field => field?.name === dateField.name)) filteredDefs.push(dateField);

    QueryChangeManager.setQueryState({
      activeFilters: {
        [dateField.name]: {
          filters: [{ cond: 'equals', val: '1/2/2026' }]
        }
      },
      displayedFields: ['Smoke Title']
    }, { source: 'BrowserSmoke.dateTypingSeed' });
    await QueryFormMode.activateFromCurrentQuery();
  });

  const dateInput = page.locator('#form-mode-card .custom-date-input--form input').first();
  await dateInput.waitFor({ state: 'visible', timeout: 5000 });
  await dateInput.fill('1/');
  await page.waitForTimeout(120);

  const draftMetrics = await page.evaluate(async () => {
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    const input = document.querySelector('#form-mode-card .custom-date-input--form input');
    const validation = document.querySelector('#form-mode-validation');
    return {
      filterValue: QueryStateReaders.getActiveFilters()['Smoke Due Date']?.filters?.[0]?.val || '',
      inputValue: input?.value || '',
      validationHidden: validation?.classList.contains('hidden') || false,
      validationText: validation?.textContent || ''
    };
  });
  if (draftMetrics.inputValue !== '1/' || draftMetrics.filterValue !== '1/2/2026' || !draftMetrics.validationHidden) {
    throw new Error(`Partial form date typing should remain a draft without live conversion or validation: ${JSON.stringify(draftMetrics)}`);
  }

  await page.waitForTimeout(900);
  const partialIdleMetrics = await page.evaluate(async () => {
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    return {
      filterValue: QueryStateReaders.getActiveFilters()['Smoke Due Date']?.filters?.[0]?.val || '',
      inputValue: document.querySelector('#form-mode-card .custom-date-input--form input')?.value || ''
    };
  });
  if (partialIdleMetrics.inputValue !== '1/' || partialIdleMetrics.filterValue !== '1/2/2026') {
    throw new Error(`Partial form date typing should not commit after idle: ${JSON.stringify(partialIdleMetrics)}`);
  }

  await dateInput.fill('Feb 3, 2026');
  await page.waitForFunction(async () => {
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    const inputValue = document.querySelector('#form-mode-card .custom-date-input--form input')?.value || '';
    const filterValue = QueryStateReaders.getActiveFilters()['Smoke Due Date']?.filters?.[0]?.val || '';
    return inputValue === '2/3/2026' && filterValue === '2/3/2026';
  }, null, { timeout: 5000 });

  await dateInput.fill('Mar 4, 2026');
  await dateInput.evaluate(input => input.blur());
  await page.waitForFunction(async () => {
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    const inputValue = document.querySelector('#form-mode-card .custom-date-input--form input')?.value || '';
    const filterValue = QueryStateReaders.getActiveFilters()['Smoke Due Date']?.filters?.[0]?.val || '';
    return inputValue === '3/4/2026' && filterValue === '3/4/2026';
  }, null, { timeout: 5000 });

  await page.evaluate(async () => {
    const { QueryChangeManager } = await import('./src/core/queryState.js');
    await QueryChangeManager.clearQuery({ source: 'BrowserSmoke.dateTypingCleanup' });
  });
}

export {
  exerciseColumnDragOutsideTableInteraction,
  exerciseColumnResizeInteraction,
  exerciseCoreFilterStateInteraction,
  exerciseDesktopResultsWorkflow,
  exerciseEditableFormUrlRefresh,
  exerciseExpandedVirtualTableColumnAlignment,
  exerciseFieldPickerPreviewList,
  exerciseFormModeBuildableDisplayField,
  exerciseTableBuildableDisplayField,
  exerciseFormModeDateTypingCommit,
  exerciseJsonResultPayloadWorkflow,
  exerciseLegacyFormUrlCanonicalization,
  exerciseLiveResponsiveResize,
  exerciseTabletLandscapeMobileParity,
  exerciseTabletPortraitMobileParity,
  exerciseVirtualTableScrollInteraction,
  exerciseZeroResultQueryWorkflow,
  expectCustomDatePickerNeverOption,
  expectMobileColumnResizeInteraction,
  expectMobileFilterEditorSheet
};
