import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright';

import {
  QUERY_API_PATTERN,
  attachFailureListeners,
  buildJsonlResultStream,
  cleanupMobilePageScroll,
  closeServer,
  dragTouchLocatorToLocator,
  exerciseMobileToastQueue,
  expectControlsNonSelectable,
  expectDarkInput,
  expectDarkSurface,
  expectElementWithinViewport,
  expectLightInput,
  expectMinimumTapTarget,
  expectMobileEditableFocusContained,
  expectMobileHeaderDoesNotCoverTableOnScroll,
  expectMobileHeaderDragDoesNotOpenContextMenu,
  expectMobileScrollLockReleased,
  expectMobileTableContextMenu,
  expectMobileTableTextNonSelectable,
  expectMobileViewportStability,
  expectNoHorizontalOverflow,
  expectOverlayConsumesScroll,
  expectOverlayTouchPanScroll,
  expectStartupStatusVisible,
  expectVisibleCloseControlCount,
  installQueryApiStub,
  listen,
  openExportOverlayPromptly,
  openMobilePanel,
  parseQueryApiPayload,
  primeMobilePageScroll,
  queueHistoryStatusResponses,
  seedLoadedResults,
  serveStaticFile,
  smokeFieldDefinitions,
  smokeResultHeaders,
  stubExternalAssets,
  waitForAppReady,
  waitForExportOptionsReady,
  waitForGroupedExportAvailable,
  waitForResponsiveResize
} from './support/browserSmokeSupport.mjs';
import {
  exerciseColumnDragOutsideTableInteraction,
  exerciseColumnResizeInteraction,
  exerciseCoreFilterStateInteraction,
  exerciseDesktopResultsWorkflow,
  exerciseEditableFormUrlRefresh,
  exerciseExpandedVirtualTableColumnAlignment,
  exerciseFieldPickerPreviewList,
  exerciseFormModeBuildableDisplayField,
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
} from './scenarios/browserSmokeScenarios.mjs';

async function runSmokeTest() {
  const server = createServer(serveStaticFile);
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}/index.html`;
  let browser;
  let page;
  const failures = [];

  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    attachFailureListeners(page, failures, port);

    await stubExternalAssets(page);
    const queryApiStub = await installQueryApiStub(page);
    queryApiStub.enqueue({
      action: 'get_fields',
      body: JSON.stringify({ fields: smokeFieldDefinitions }),
      contentType: 'application/json; charset=utf-8',
      delayMs: 850
    });
    let delayedCacheManifest = false;
    await page.route(/\/cache-bust\.json/u, async route => {
      if (!delayedCacheManifest) {
        delayedCacheManifest = true;
        await new Promise(resolve => setTimeout(resolve, 900));
      }
      await route.continue();
    });

    const navigation = page.goto(baseUrl, { waitUntil: 'load', timeout: 15000 });
    await expectStartupStatusVisible(page, { beforeAppModules: true });
    await navigation;
    await waitForAppReady(page, failures);
    if (queryApiStub.countAction('get_fields') !== 1) {
      throw new Error(`Startup should share one backend field metadata request, saw ${queryApiStub.countAction('get_fields')}`);
    }

    if (failures.length > 0) {
      throw new Error(`Browser smoke test failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
    }

    await expectNoHorizontalOverflow(page, 'Desktop initial layout');
    await expectControlsNonSelectable(page, 'body', 'Desktop initial layout');
    await expectDarkInput(page, '#query-input', 'Main field search input');
    await expectCustomDatePickerNeverOption(page);
    await exerciseFormModeDateTypingCommit(page);
    await page.evaluate(async () => {
      const { QueryTableView } = await import('./src/ui/queryTableView.js');
      QueryTableView.renderEmptyQueryTableState();
      document.body.classList.add('form-mode-active');
      QueryTableView.syncEmptyTableMessage();
    });
    const formModeEmptyTableMessage = await page.locator('[data-empty-table-message]').first().textContent();
    if (/drag a bubble/iu.test(formModeEmptyTableMessage || '')) {
      throw new Error('Form mode empty table message still references dragging a bubble');
    }
    if (!/add a field/iu.test(formModeEmptyTableMessage || '')) {
      throw new Error(`Unexpected form mode empty table message: ${formModeEmptyTableMessage}`);
    }
    await page.evaluate(async () => {
      const { QueryTableView } = await import('./src/ui/queryTableView.js');
      document.body.classList.remove('form-mode-active');
      QueryTableView.syncEmptyTableMessage();
    });

    await exerciseCoreFilterStateInteraction(page);
    await exerciseFieldPickerPreviewList(page);
    await exerciseFormModeBuildableDisplayField(page);
    await exerciseEditableFormUrlRefresh(page, failures);
    await exerciseLegacyFormUrlCanonicalization(page, baseUrl, failures);
    await exerciseDesktopResultsWorkflow(page);
    await exerciseZeroResultQueryWorkflow(page, queryApiStub);
    await exerciseJsonResultPayloadWorkflow(page, queryApiStub);
    await exerciseVirtualTableScrollInteraction(page);
    await exerciseExpandedVirtualTableColumnAlignment(page);
    await exerciseColumnResizeInteraction(page);
    await exerciseColumnDragOutsideTableInteraction(page);
    await exerciseLiveResponsiveResize(page);

    await page.goto(baseUrl, { waitUntil: 'load', timeout: 15000 });
    await waitForAppReady(page, failures);

    queueHistoryStatusResponses(queryApiStub);
    await page.getByRole('button', { name: 'Queries' }).click();
    await page.locator('input[placeholder="Search history"]').waitFor({ state: 'visible', timeout: 5000 });
    await expectDarkInput(page, '#queries-search', 'Query history search input');
    await page.locator('#queries-status-filter').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#queries-result-filter').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#queries-duration-filter').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#queries-sort').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForFunction(() => {
      return document.querySelector('[data-history-book="complete"] .history-book-count')?.textContent?.trim() === '1'
        && document.querySelector('[data-history-book="running"] .history-book-count')?.textContent?.trim() === '1';
    }, null, { timeout: 5000 });
    await page.locator('#queries-status-filter').selectOption('complete');
    await page.locator('#queries-result-filter').selectOption('has_results');
    await page.locator('#queries-sort').selectOption('most_results');
    await page.waitForFunction(() => {
      return document.querySelector('[data-history-book="complete"] .history-book-count')?.textContent?.trim() === '1'
        && document.querySelector('[data-history-book="running"] .history-book-count')?.textContent?.trim() === '0'
        && document.querySelector('#queries-sort')?.value === 'most_results';
    }, null, { timeout: 5000 });
    await page.locator('[data-history-book="complete"] .history-book-summary').click();
    await page.locator('.history-monitor').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.history-monitor .template-query-btn').first().click();
    await page.locator('#templates-detail-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    const historyTemplateDraft = await page.evaluate(() => ({
      templatePanelOpen: !document.querySelector('#templates-panel')?.classList.contains('hidden'),
      queriesPanelOpen: !document.querySelector('#queries-panel')?.classList.contains('hidden'),
      name: document.querySelector('#template-name-input')?.value || '',
      description: document.querySelector('#template-description-input')?.value || ''
    }));
    if (
      !historyTemplateDraft.templatePanelOpen
      || historyTemplateDraft.queriesPanelOpen
      || historyTemplateDraft.name !== 'Mobile completed smoke query'
      || !historyTemplateDraft.description.includes('browser-smoke-complete')
    ) {
      throw new Error(`History query should open as a template draft: ${JSON.stringify(historyTemplateDraft)}`);
    }
    queryApiStub.enqueue({
      action: 'create_template',
      body: JSON.stringify({
        template: {
          id: 'history-template-from-smoke',
          name: 'Mobile completed smoke query',
          description: 'Created from query history item browser-smoke-complete.',
          categories: [],
          ui_config: {
            DesiredColumnOrder: ['Smoke Title', 'Smoke Branch', 'Smoke Status'],
            Filters: {}
          }
        }
      }),
      contentType: 'application/json; charset=utf-8'
    });
    const createHistoryTemplateResponse = page.waitForResponse(response => {
      if (!QUERY_API_PATTERN.test(response.url())) {
        return false;
      }
      const payload = parseQueryApiPayload(response.request());
      return payload.action === 'create_template';
    });
    await page.locator('#template-save-btn').click();
    await createHistoryTemplateResponse;
    const createTemplateRequest = queryApiStub.getRequests('create_template').at(-1)?.payload;
    if (
      createTemplateRequest?.name !== 'Mobile completed smoke query'
      || !Array.isArray(createTemplateRequest?.ui_config?.DesiredColumnOrder)
      || !createTemplateRequest.ui_config.DesiredColumnOrder.includes('Smoke Status')
    ) {
      throw new Error(`History template save should use the history query config: ${JSON.stringify(createTemplateRequest)}`);
    }
    await page.locator('#templates-detail-close-btn').click();
    await page.locator('#templates-detail-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });
    await page.locator('#templates-panel .collapse-btn').click();
    await page.locator('#templates-panel.hidden').waitFor({ state: 'attached', timeout: 5000 });

    queueHistoryStatusResponses(queryApiStub, 3);
    await page.getByRole('button', { name: 'Queries' }).click();
    if (!(await page.locator('.history-monitor').isVisible())) {
      await page.locator('[data-history-book="complete"] .history-book-summary').click();
    }
    await page.locator('.history-monitor').waitFor({ state: 'visible', timeout: 5000 });
    queryApiStub.enqueue({
      action: 'get_results',
      body: buildJsonlResultStream({
        queryId: 'browser-smoke-complete',
        rows: [
          ['Loaded One', ['Main', 'East'], 'Open'],
          ['Loaded Two', 'East', 'Closed']
        ]
      }),
      contentType: 'application/x-ndjson; charset=utf-8',
      delayMs: 300,
      rawColumns: smokeResultHeaders
    });
    const historyLoadClick = page.locator('.history-monitor .load-query-btn').first().click();
    await page.locator('.history-result-load-progress').waitFor({ state: 'visible', timeout: 5000 });
    const historyLoadProgressText = await page.locator('.history-result-load-progress').textContent();
    if (!/Loading saved results/iu.test(historyLoadProgressText || '') || !/Waiting for rows|rows received/iu.test(historyLoadProgressText || '')) {
      throw new Error(`History result load progress should be visible while waiting: ${historyLoadProgressText}`);
    }
    await historyLoadClick;
    await page.locator('.history-result-load-progress').waitFor({ state: 'detached', timeout: 5000 });
    const rememberedHistoryResult = await page.evaluate(() => {
      const raw = window.localStorage.getItem('query:lastOpenedHistoryResult');
      return raw ? JSON.parse(raw) : null;
    });
    if (rememberedHistoryResult?.queryId !== 'browser-smoke-complete') {
      throw new Error(`History result load should remember the opened query id: ${JSON.stringify(rememberedHistoryResult)}`);
    }
    const cachedHistoryResult = await page.evaluate(async () => {
      const { readCachedHistoryResultSnapshot } = await import('./src/features/history/results/queryHistoryResultCache.js');
      return readCachedHistoryResultSnapshot('browser-smoke-complete');
    });
    if (
      cachedHistoryResult?.queryId !== 'browser-smoke-complete'
      || cachedHistoryResult?.rows?.length !== 2
      || cachedHistoryResult.rows[0][0] !== 'Loaded One'
    ) {
      throw new Error(`History result load should cache the opened rows locally: ${JSON.stringify(cachedHistoryResult)}`);
    }

    queueHistoryStatusResponses(queryApiStub, 6);
    const getResultsRequestsBeforeReload = queryApiStub.countAction('get_results');
    const splitPreferenceBeforeReload = await page.locator('#split-columns-toggle').evaluate(async button => {
      const { SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY } = await import('./src/features/table/export/splitColumnsToggleUi.js');
      if (button.querySelector('#split-toggle-icon-stack') && !button.querySelector('#split-toggle-icon-stack').classList.contains('hidden')) {
        button.click();
      }
      return window.localStorage.getItem(SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY);
    });
    if (splitPreferenceBeforeReload !== 'split') {
      throw new Error(`Split preference should be stored before result reload: ${splitPreferenceBeforeReload}`);
    }
    await page.evaluate(async () => {
      const { appServices } = await import('./src/core/appServices.js');
      const { QueryChangeManager, QueryStateReaders } = await import('./src/core/queryState.js');
      const queryInput = document.querySelector('#query-input');
      const currentFields = QueryStateReaders.getDisplayedFields();
      const branchFields = currentFields.filter(field => /^Smoke Branch(?:\s+\d+)?$/u.test(field));
      if (queryInput) {
        queryInput.value = 'status';
        queryInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      QueryChangeManager.replaceDisplayedFields([
        'Smoke Status',
        ...branchFields,
        'Smoke Title'
      ], { source: 'BrowserSmoke.seedOpenedResultViewState' });
      appServices.replacePostFilters({
        'Smoke Status': {
          logic: 'all',
          filters: [
            { cond: 'equals', val: 'Open', vals: ['Open'] }
          ]
        }
      }, { refreshView: true, notify: true, resetScroll: true });
    });
    let seededResultViewState = null;
    const resultViewWaitStart = Date.now();
    while (Date.now() - resultViewWaitStart < 5000) {
      seededResultViewState = await page.evaluate(async () => {
        const {
          RESULT_VIEW_URL_PARAM,
          decodeResultViewStateParam
        } = await import('./src/core/resultViewState.js');
        const { readCachedHistoryResultSnapshot } = await import('./src/features/history/results/queryHistoryResultCache.js');
        const snapshot = await readCachedHistoryResultSnapshot('browser-smoke-complete');
        const fields = snapshot?.viewState?.displayedFields || [];
        const filter = snapshot?.viewState?.postFilters?.['Smoke Status']?.filters?.[0];
        const raw = new URL(window.location.href).searchParams.get(RESULT_VIEW_URL_PARAM);
        const urlState = decodeResultViewStateParam(raw);
        const urlFilter = urlState?.postFilters?.['Smoke Status']?.filters?.[0];
        return {
          cacheFilter: filter,
          cacheFields: fields,
          cacheFieldSearch: snapshot?.viewState?.fieldSearch || '',
          decoded: urlState,
          raw,
          urlFilter
        };
      });
      if (
        seededResultViewState.cacheFields.join('|') === 'Smoke Status|Smoke Branch 1|Smoke Branch 2|Smoke Title'
        && seededResultViewState.cacheFieldSearch === 'status'
        && seededResultViewState.cacheFilter?.cond === 'equals'
        && seededResultViewState.cacheFilter?.val === 'Open'
        && seededResultViewState.decoded?.displayedFields?.join('|') === 'Smoke Status|Smoke Branch 1|Smoke Branch 2|Smoke Title'
        && seededResultViewState.decoded?.fieldSearch === 'status'
        && seededResultViewState.urlFilter?.cond === 'equals'
        && seededResultViewState.urlFilter?.val === 'Open'
      ) {
        break;
      }
      await page.waitForTimeout(50);
    }
    if (
      !seededResultViewState?.raw
      || seededResultViewState?.decoded?.displayedFields?.join('|') !== 'Smoke Status|Smoke Branch 1|Smoke Branch 2|Smoke Title'
      || seededResultViewState?.decoded?.fieldSearch !== 'status'
      || seededResultViewState?.decoded?.postFilters?.['Smoke Status']?.filters?.[0]?.val !== 'Open'
      || ['rows', 'objectRows', 'headers', 'data', 'items', 'records'].some(key => Object.prototype.hasOwnProperty.call(seededResultViewState?.decoded || {}, key))
    ) {
      throw new Error(`Result URL should include view state only, without result rows: ${JSON.stringify(seededResultViewState)}`);
    }
    const editableResultUrl = await page.evaluate(async () => {
      const { QueryFormMode } = await import('./src/ui/form-mode/formMode.js');
      const nextUrl = QueryFormMode.buildCurrentShareUrl({ limited: false });
      const rawRemembered = window.localStorage.getItem('query:lastOpenedHistoryResult');
      const remembered = rawRemembered ? JSON.parse(rawRemembered) : null;
      const url = new URL(nextUrl || window.location.href);
      if (remembered?.queryId) {
        url.searchParams.set('result', remembered.queryId);
      }
      window.localStorage.removeItem('query:lastOpenedHistoryResult');
      if (nextUrl) {
        window.history.replaceState({}, '', url.toString());
      }
      return window.location.href;
    });
    const parsedEditableResultUrl = new URL(editableResultUrl);
    if (
      !parsedEditableResultUrl.searchParams.has('form')
      || parsedEditableResultUrl.searchParams.has('limited')
      || parsedEditableResultUrl.searchParams.get('result') !== 'browser-smoke-complete'
      || !parsedEditableResultUrl.searchParams.get('resultView')
    ) {
      throw new Error(`Result reload smoke should exercise an editable form URL: ${editableResultUrl}`);
    }
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    await waitForAppReady(page, failures);
    await page.waitForFunction(async () => {
      const { appServices } = await import('./src/core/appServices.js');
      return appServices.getVirtualTableData()?.rows?.some(row => row[0] === 'Loaded One');
    }, null, { timeout: 7000 });
    const restoredHistoryResult = await page.evaluate(async () => {
      const { appServices } = await import('./src/core/appServices.js');
      const { QueryFormMode } = await import('./src/ui/form-mode/formMode.js');
      const { QueryStateReaders } = await import('./src/core/queryState.js');
      const { decodeResultViewStateParam } = await import('./src/core/resultViewState.js');
      const tableData = appServices.getVirtualTableData();
      const { SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY } = await import('./src/features/table/export/splitColumnsToggleUi.js');
      const rawRemembered = window.localStorage.getItem('query:lastOpenedHistoryResult');
      const defaultShareUrl = new URL(QueryFormMode.buildCurrentShareUrl());
      const cleanFormUrl = new URL(QueryFormMode.buildCurrentShareUrl({ includeResult: false, limited: false }));
      const resultViewParam = new URL(window.location.href).searchParams.get('resultView');
      return {
        cleanFormHasLimited: cleanFormUrl.searchParams.has('limited'),
        cleanFormResult: cleanFormUrl.searchParams.get('result'),
        currentQueryId: QueryStateReaders.getLifecycleState().currentQueryId,
        defaultShareLimited: defaultShareUrl.searchParams.get('limited'),
        defaultShareResult: defaultShareUrl.searchParams.get('result'),
        displayedFields: QueryStateReaders.getDisplayedFields(),
        fieldSearch: document.querySelector('#query-input')?.value || '',
        hasLoadedResultSet: QueryStateReaders.getLifecycleState().hasLoadedResultSet,
        headers: tableData?.headers || [],
        postFilters: appServices.getPostFilterState?.() || {},
        remembered: rawRemembered ? JSON.parse(rawRemembered) : null,
        resultView: decodeResultViewStateParam(resultViewParam),
        rows: tableData?.rows || [],
        splitActive: appServices.isSplitColumnsActive?.(),
        splitPreference: window.localStorage.getItem(SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY),
        splitToggleActive: !document.querySelector('#split-toggle-icon-cols')?.classList.contains('hidden')
      };
    });
    if (
      restoredHistoryResult.currentQueryId !== 'browser-smoke-complete'
      || restoredHistoryResult.hasLoadedResultSet !== true
      || restoredHistoryResult.rows.length !== 1
      || restoredHistoryResult.rows[0][0] !== 'Loaded One'
      || !restoredHistoryResult.headers.includes('Smoke Branch 2')
      || restoredHistoryResult.rows[0][2] !== 'East'
      || restoredHistoryResult.displayedFields.join('|') !== 'Smoke Status|Smoke Branch 1|Smoke Branch 2|Smoke Title'
      || restoredHistoryResult.fieldSearch !== 'status'
      || restoredHistoryResult.postFilters?.['Smoke Status']?.filters?.[0]?.val !== 'Open'
      || restoredHistoryResult.resultView?.displayedFields?.join('|') !== 'Smoke Status|Smoke Branch 1|Smoke Branch 2|Smoke Title'
      || restoredHistoryResult.resultView?.fieldSearch !== 'status'
      || restoredHistoryResult.splitActive !== true
      || restoredHistoryResult.splitPreference !== 'split'
      || restoredHistoryResult.splitToggleActive !== true
      || restoredHistoryResult.remembered?.queryId !== 'browser-smoke-complete'
      || restoredHistoryResult.defaultShareResult !== 'browser-smoke-complete'
      || restoredHistoryResult.defaultShareLimited !== '1'
      || restoredHistoryResult.cleanFormResult !== null
      || restoredHistoryResult.cleanFormHasLimited
      || queryApiStub.countAction('get_results') !== getResultsRequestsBeforeReload
    ) {
      throw new Error(`Reload should restore the last opened history results: ${JSON.stringify({
        ...restoredHistoryResult,
        getResultsRequestsBeforeReload,
        getResultsRequests: queryApiStub.countAction('get_results'),
        statusRequests: queryApiStub.countAction('status')
      })}`);
    }

    await page.getByRole('button', { name: 'Templates' }).click();
    await page.locator('input[placeholder="Search templates"]').waitFor({ state: 'visible', timeout: 5000 });
    await expectDarkSurface(page, '#templates-panel > h2', 'Templates panel header');
    await expectDarkInput(page, '#templates-search-input', 'Templates search input');
    await page.locator('#templates-list .templates-list-item').click();
    await page.locator('#templates-detail-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectVisibleCloseControlCount(page, '#templates-panel', 1, 'Desktop template detail overlay');
    await expectControlsNonSelectable(page, '#templates-panel', 'Desktop template controls');
    await page.locator('#templates-detail-close-btn').click();
    await page.locator('#templates-detail-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });

    await page.getByRole('button', { name: 'API Settings' }).click();
    await page.locator('#api-settings-container').waitFor({ state: 'visible', timeout: 5000 });
    await expectDarkSurface(page, '#api-settings-panel > h2', 'API settings panel header');
    await expectDarkInput(page, '#api-settings-url-input', 'API settings URL input');
    const initialApiSettings = await page.evaluate(async () => {
      const { DEFAULT_API_URL, API_URL_STORAGE_KEY, getApiUrl } = await import('./src/core/backendApi.js');
      return {
        current: getApiUrl(),
        defaultUrl: DEFAULT_API_URL,
        inputValue: document.querySelector('#api-settings-url-input')?.value || '',
        mode: document.querySelector('#api-settings-mode')?.textContent?.trim() || '',
        stored: window.localStorage.getItem(API_URL_STORAGE_KEY)
      };
    });
    if (
      initialApiSettings.current !== initialApiSettings.defaultUrl
      || initialApiSettings.inputValue !== initialApiSettings.defaultUrl
      || initialApiSettings.mode !== 'Public default'
      || initialApiSettings.stored !== null
    ) {
      throw new Error(`API settings should start on the public default: ${JSON.stringify(initialApiSettings)}`);
    }
    await page.locator('#api-settings-test-btn').click();
    await page.waitForFunction(() => /Connected\. Loaded \d+ fields\./u.test(document.querySelector('#api-settings-status')?.textContent || ''), null, { timeout: 5000 });
    await page.locator('#api-settings-url-input').fill('/query-api');
    await page.locator('#api-settings-save-btn').click();
    const savedApiSettings = await page.evaluate(async () => {
      const { API_URL_STORAGE_KEY, getApiUrl } = await import('./src/core/backendApi.js');
      return {
        current: getApiUrl(),
        launchUrl: document.querySelector('#api-settings-launch-url')?.textContent || '',
        mode: document.querySelector('#api-settings-mode')?.textContent?.trim() || '',
        reloadVisible: !document.querySelector('#api-settings-reload-btn')?.classList.contains('hidden'),
        stored: window.localStorage.getItem(API_URL_STORAGE_KEY)
      };
    });
    if (
      !savedApiSettings.current.endsWith('/query-api')
      || savedApiSettings.current !== savedApiSettings.stored
      || savedApiSettings.mode !== 'Custom endpoint'
      || !savedApiSettings.reloadVisible
      || !new URL(savedApiSettings.launchUrl).searchParams.get('api_url')?.endsWith('/query-api')
    ) {
      throw new Error(`API settings should save custom endpoints and build launch links: ${JSON.stringify(savedApiSettings)}`);
    }
    await page.locator('#api-settings-reset-btn').click();
    const resetApiSettings = await page.evaluate(async () => {
      const { API_URL_STORAGE_KEY, DEFAULT_API_URL, getApiUrl } = await import('./src/core/backendApi.js');
      return {
        current: getApiUrl(),
        defaultUrl: DEFAULT_API_URL,
        mode: document.querySelector('#api-settings-mode')?.textContent?.trim() || '',
        stored: window.localStorage.getItem(API_URL_STORAGE_KEY)
      };
    });
    if (
      resetApiSettings.current !== resetApiSettings.defaultUrl
      || resetApiSettings.mode !== 'Public default'
      || resetApiSettings.stored !== null
    ) {
      throw new Error(`API settings should reset to the public default: ${JSON.stringify(resetApiSettings)}`);
    }
    await page.locator('#api-settings-panel .collapse-btn').click();
    await page.locator('#api-settings-panel.hidden').waitFor({ state: 'attached', timeout: 5000 });

    await page.getByRole('button', { name: 'Help' }).click();
    await page.locator('#help-container').waitFor({ state: 'visible', timeout: 5000 });
    await expectControlsNonSelectable(page, '#help-panel', 'Desktop help controls');

    const tabletPage = await browser.newPage({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 1180, height: 820 }
    });
    attachFailureListeners(tabletPage, failures, port);
    await stubExternalAssets(tabletPage);
    const tabletQueryApiStub = await installQueryApiStub(tabletPage);
    await tabletPage.goto(baseUrl, { waitUntil: 'load', timeout: 15000 });
    await waitForAppReady(tabletPage, failures);
    await exerciseTabletLandscapeMobileParity(tabletPage, tabletQueryApiStub);
    await tabletPage.close();

    const tabletPortraitPage = await browser.newPage({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 820, height: 1180 }
    });
    attachFailureListeners(tabletPortraitPage, failures, port);
    await stubExternalAssets(tabletPortraitPage);
    const tabletPortraitQueryApiStub = await installQueryApiStub(tabletPortraitPage);
    await tabletPortraitPage.goto(baseUrl, { waitUntil: 'load', timeout: 15000 });
    await waitForAppReady(tabletPortraitPage, failures);
    await exerciseTabletPortraitMobileParity(tabletPortraitPage, tabletPortraitQueryApiStub);
    await tabletPortraitPage.close();

    const mobilePage = await browser.newPage({
      isMobile: true,
      viewport: { width: 390, height: 844 }
    });
    attachFailureListeners(mobilePage, failures, port);
    await stubExternalAssets(mobilePage);
    const mobileQueryApiStub = await installQueryApiStub(mobilePage);
    await mobilePage.goto(baseUrl, { waitUntil: 'load', timeout: 15000 });
    await waitForAppReady(mobilePage, failures);
    await waitForResponsiveResize(mobilePage, true);
    await expectMobileViewportStability(mobilePage);

    if (failures.length > 0) {
      throw new Error(`Browser smoke test failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
    }

    await mobilePage.locator('#mobile-menu-toggle').waitFor({ state: 'visible', timeout: 5000 });
    const desktopControlsDisplay = await mobilePage.locator('#header-controls').evaluate(element => {
      return window.getComputedStyle(element).display;
    });
    if (desktopControlsDisplay !== 'none') {
      throw new Error(`Desktop header controls are visible on mobile: display=${desktopControlsDisplay}`);
    }
    await exerciseMobileToastQueue(mobilePage);

    await expectNoHorizontalOverflow(mobilePage, 'Mobile initial layout');
    const initialMobileFocusLayout = await mobilePage.evaluate(() => {
      const formCard = document.querySelector('#form-mode-card');
      const tableSection = document.querySelector('#table-with-filter');
      const formRect = formCard?.getBoundingClientRect();
      const tableStyles = tableSection ? window.getComputedStyle(tableSection) : null;
      return {
        formVisible: Boolean(formRect && formRect.width > 0 && formRect.height > 0),
        formTop: formRect?.top ?? 0,
        tableDisplay: tableStyles?.display || '',
        hasLoadedData: document.body.classList.contains('has-loaded-data'),
        hasQueryColumns: document.body.classList.contains('has-query-columns')
      };
    });
    if (!initialMobileFocusLayout.formVisible || initialMobileFocusLayout.formTop > 120) {
      throw new Error(`Mobile form should be the first visible workflow: ${JSON.stringify(initialMobileFocusLayout)}`);
    }
    if (initialMobileFocusLayout.tableDisplay !== 'none') {
      throw new Error(`Empty mobile form mode should not show the result table first: ${JSON.stringify(initialMobileFocusLayout)}`);
    }

    await mobilePage.locator('#mobile-menu-toggle').click();
    await mobilePage.locator('#mobile-menu-dropdown.show').waitFor({ state: 'visible', timeout: 5000 });
    await expectControlsNonSelectable(mobilePage, '#mobile-menu-dropdown', 'Mobile menu controls');
    const mobileMenuMetrics = await mobilePage.locator('#mobile-menu-dropdown.show').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return {
        bottomGap: Math.abs(window.innerHeight - rect.bottom),
        height: rect.height,
        viewportHeight: window.innerHeight
      };
    });
    if (mobileMenuMetrics.bottomGap > 1 || mobileMenuMetrics.height > mobileMenuMetrics.viewportHeight * 0.86) {
      throw new Error(`Mobile menu should open as a bottom sheet: ${JSON.stringify(mobileMenuMetrics)}`);
    }
    await expectMinimumTapTarget(mobilePage, '#mobile-menu-dropdown .mobile-menu-item', 'Mobile menu items');
    const mobileMenuLabels = await mobilePage.locator('#mobile-menu-dropdown .mobile-menu-item').evaluateAll(items => {
      return items.map(item => (item.textContent || '').trim().replace(/\s+/gu, ' '));
    });
    ['Run Query', 'Multi-value Export', 'JSON', 'Queries', 'Templates', 'Help'].forEach(expectedLabel => {
      if (!mobileMenuLabels.some(label => label.includes(expectedLabel))) {
        throw new Error(`Mobile menu is missing "${expectedLabel}": ${JSON.stringify(mobileMenuLabels)}`);
      }
    });
    await expectNoHorizontalOverflow(mobilePage, 'Mobile menu');
    queueHistoryStatusResponses(mobileQueryApiStub);
    await mobilePage.locator('[data-source-control-id="toggle-queries"]').click();
    await mobilePage.locator('#queries-search').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#queries-panel', 'Mobile query history panel');
    await expectDarkInput(mobilePage, '#queries-search', 'Mobile query history search input');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile query history panel');
    await mobilePage.waitForFunction(() => {
      return document.querySelector('[data-history-book="complete"] .history-book-count')?.textContent?.trim() === '1'
        && document.querySelector('[data-history-book="running"] .history-book-count')?.textContent?.trim() === '1';
    }, null, { timeout: 5000 });
    const mobileHistoryPickerMetrics = await mobilePage.locator('.history-bookshelf').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const hero = document.querySelector('.history-editorial-hero');
      const books = Array.from(element.querySelectorAll('[data-history-book]')).map(book => {
        const bookRect = book.getBoundingClientRect();
        return {
          bottom: bookRect.bottom,
          height: bookRect.height,
          top: bookRect.top,
          width: bookRect.width
        };
      }).filter(book => book.width > 0 && book.height > 0);

      return {
        bookCount: books.length,
        bottom: rect.bottom,
        columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
        height: rect.height,
        heroDisplay: hero ? window.getComputedStyle(hero).display : '',
        maxBookHeight: Math.max(...books.map(book => book.height)),
        viewportHeight: window.innerHeight
      };
    });
    if (
      mobileHistoryPickerMetrics.heroDisplay !== 'none'
      || mobileHistoryPickerMetrics.bookCount !== 4
      || mobileHistoryPickerMetrics.columns < 2
      || mobileHistoryPickerMetrics.height > 180
      || mobileHistoryPickerMetrics.maxBookHeight > 90
      || mobileHistoryPickerMetrics.bottom > mobileHistoryPickerMetrics.viewportHeight * 0.55
    ) {
      throw new Error(`Mobile history status picker should keep all status choices visible without a long scroll: ${JSON.stringify(mobileHistoryPickerMetrics)}`);
    }
    await expectMinimumTapTarget(mobilePage, '[data-history-book] .history-book-summary', 'Mobile history status cards');
    await mobilePage.locator('[data-history-book="complete"] .history-book-summary').click();
    await mobilePage.locator('.history-monitor').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '.history-monitor', 'Mobile query history monitor');
    await expectMinimumTapTarget(mobilePage, '.history-monitor-close, .history-monitor-tab, .history-monitor .history-expand-btn, .history-monitor .load-query-btn, .history-monitor .rerun-query-btn, .history-monitor .template-query-btn', 'Mobile history monitor controls');
    const mobileHistoryMonitorMetrics = await mobilePage.locator('.history-monitor').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const stageRect = element.querySelector('.history-monitor-stage')?.getBoundingClientRect();
      return {
        bottomGap: Math.abs(window.innerHeight - rect.bottom),
        position: window.getComputedStyle(element).position,
        stageHeight: stageRect?.height || 0,
        top: rect.top
      };
    });
    if (mobileHistoryMonitorMetrics.position !== 'fixed' || mobileHistoryMonitorMetrics.top > 80 || mobileHistoryMonitorMetrics.bottomGap > 1 || mobileHistoryMonitorMetrics.stageHeight < 120) {
      throw new Error(`Mobile history monitor should open as a visible sheet: ${JSON.stringify(mobileHistoryMonitorMetrics)}`);
    }
    await mobilePage.locator('.history-monitor .history-expand-btn').first().click();
    await mobilePage.locator('.history-details-modal').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '.history-details-modal', 'Mobile history details modal');
    await expectMinimumTapTarget(mobilePage, '.history-details-modal-close', 'Mobile history details close button');
    const mobileHistoryDetailsMetrics = await mobilePage.locator('.history-details-modal').evaluate(modal => {
      const shell = document.querySelector('.history-details-modal-shell');
      const rect = modal.getBoundingClientRect();
      const shellRect = shell?.getBoundingClientRect();
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
        bodyLocked: document.body.classList.contains('mobile-overlay-scroll-locked'),
        bottomGap: Math.abs((shellRect?.bottom || window.innerHeight) - rect.bottom),
        gridColumns: gridStyle ? gridStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        height: rect.height,
        scrollTop,
        shellBottom: shellRect?.bottom || 0,
        top: rect.top,
        width: rect.width
      };
    });
    if (
      !mobileHistoryDetailsMetrics.bodyLocked
      || mobileHistoryDetailsMetrics.gridColumns !== 1
      || mobileHistoryDetailsMetrics.width < 360
      || mobileHistoryDetailsMetrics.top < 48
      || mobileHistoryDetailsMetrics.bottomGap > 10
      || mobileHistoryDetailsMetrics.scrollTop < 120
    ) {
      throw new Error(`Mobile history details should open as a bottom-aligned scrollable sheet: ${JSON.stringify(mobileHistoryDetailsMetrics)}`);
    }
    await mobilePage.locator('.history-details-modal-close').click();
    await mobilePage.locator('.history-details-modal-shell').waitFor({ state: 'detached', timeout: 5000 });
    await mobilePage.locator('.history-monitor-close').click();
    await mobilePage.locator('.history-monitor').waitFor({ state: 'detached', timeout: 5000 });

    await openMobilePanel(mobilePage, 'toggle-json', '#query-json-tree');
    await expectElementWithinViewport(mobilePage, '#json-panel', 'Mobile JSON panel');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile JSON panel');

    await openMobilePanel(mobilePage, 'toggle-templates', '#templates-search-input');
    await expectElementWithinViewport(mobilePage, '#templates-panel', 'Mobile templates panel');
    await expectDarkSurface(mobilePage, '#templates-panel > h2', 'Mobile templates panel header');
    await expectDarkInput(mobilePage, '#templates-search-input', 'Mobile templates search input');
    await expectControlsNonSelectable(mobilePage, '#templates-panel', 'Mobile templates controls');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile templates panel');
    const mobileTemplatesPanelMetrics = await mobilePage.locator('#templates-container').evaluate(container => {
      const top = container.querySelector('.templates-browser-top');
      const listShell = container.querySelector('.templates-browser-list-shell');
      const actions = container.querySelector('.templates-sidebar-actions--library');
      const actionButtons = Array.from(actions?.querySelectorAll('button') || []);
      const containerRect = container.getBoundingClientRect();
      const topRect = top?.getBoundingClientRect();
      const listRect = listShell?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      const actionColumns = actions ? window.getComputedStyle(actions).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
      return {
        actionColumns,
        actionCount: actionButtons.length,
        actionsHeight: actionsRect?.height || 0,
        containerHeight: containerRect.height,
        listHeight: listRect?.height || 0,
        topHeight: topRect?.height || 0,
        viewportHeight: window.innerHeight
      };
    });
    if (
      mobileTemplatesPanelMetrics.actionColumns < 3
      || mobileTemplatesPanelMetrics.actionCount < 3
      || mobileTemplatesPanelMetrics.actionsHeight > 72
      || mobileTemplatesPanelMetrics.topHeight > mobileTemplatesPanelMetrics.viewportHeight * 0.38
      || mobileTemplatesPanelMetrics.listHeight < mobileTemplatesPanelMetrics.viewportHeight * 0.3
    ) {
      throw new Error(`Mobile templates panel should keep controls compact and leave room for the template list: ${JSON.stringify(mobileTemplatesPanelMetrics)}`);
    }
    await mobilePage.locator('#templates-list .templates-list-item').click();
    await mobilePage.locator('#templates-detail-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectVisibleCloseControlCount(mobilePage, '#templates-panel', 1, 'Mobile template detail overlay');
    await expectControlsNonSelectable(mobilePage, '#templates-panel', 'Mobile template detail controls');
    const mobileTemplateDetailMetrics = await mobilePage.locator('#templates-detail').evaluate(detail => {
      const container = document.querySelector('#templates-container');
      const body = detail.querySelector('.templates-detail-body');
      const actions = detail.querySelector('.templates-detail-actions');
      const close = detail.querySelector('#templates-detail-close-btn');
      const detailRect = detail.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();
      const bodyRect = body?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      const closeRect = close?.getBoundingClientRect();
      const actionColumns = actions ? window.getComputedStyle(actions).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
      return {
        actionColumns,
        actionsHeight: actionsRect?.height || 0,
        bodyHeight: bodyRect?.height || 0,
        bottomGap: containerRect ? Math.abs(containerRect.bottom - detailRect.bottom) : 0,
        closeHeight: closeRect?.height || 0,
        closeWidth: closeRect?.width || 0,
        topGap: containerRect ? Math.abs(detailRect.top - containerRect.top) : 0,
        viewportHeight: window.innerHeight
      };
    });
    if (
      mobileTemplateDetailMetrics.topGap > 2
      || mobileTemplateDetailMetrics.bottomGap > 2
      || mobileTemplateDetailMetrics.bodyHeight < mobileTemplateDetailMetrics.viewportHeight * 0.36
      || mobileTemplateDetailMetrics.actionsHeight > 128
      || mobileTemplateDetailMetrics.actionColumns < 2
      || mobileTemplateDetailMetrics.closeWidth < 40
      || mobileTemplateDetailMetrics.closeHeight < 40
    ) {
      throw new Error(`Mobile template detail should be a full-height sheet with compact actions: ${JSON.stringify(mobileTemplateDetailMetrics)}`);
    }
    await expectMobileEditableFocusContained(mobilePage, '#template-name-input', '.templates-detail-body', 'Mobile template name input');
    await mobilePage.locator('#templates-detail-close-btn').click();
    await mobilePage.locator('#templates-detail-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });
    await mobilePage.locator('#templates-manage-categories-btn').click();
    await mobilePage.locator('#templates-categories-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectVisibleCloseControlCount(mobilePage, '#templates-panel', 1, 'Mobile template categories overlay');
    await expectControlsNonSelectable(mobilePage, '#templates-panel', 'Mobile template category controls');
    const mobileTemplateCategoriesMetrics = await mobilePage.locator('.templates-categories-dialog').evaluate(dialog => {
      const container = document.querySelector('#templates-container');
      const body = dialog.querySelector('.templates-categories-body');
      const close = dialog.querySelector('#templates-categories-close-btn');
      const dialogRect = dialog.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();
      const bodyRect = body?.getBoundingClientRect();
      const closeRect = close?.getBoundingClientRect();
      return {
        bodyHeight: bodyRect?.height || 0,
        bottomGap: containerRect ? Math.abs(containerRect.bottom - dialogRect.bottom) : 0,
        closeHeight: closeRect?.height || 0,
        closeWidth: closeRect?.width || 0,
        topGap: containerRect ? Math.abs(dialogRect.top - containerRect.top) : 0,
        viewportHeight: window.innerHeight
      };
    });
    if (
      mobileTemplateCategoriesMetrics.topGap > 2
      || mobileTemplateCategoriesMetrics.bottomGap > 2
      || mobileTemplateCategoriesMetrics.bodyHeight < mobileTemplateCategoriesMetrics.viewportHeight * 0.45
      || mobileTemplateCategoriesMetrics.closeWidth < 40
      || mobileTemplateCategoriesMetrics.closeHeight < 40
    ) {
      throw new Error(`Mobile template categories should be a full-height sheet with a scrollable body: ${JSON.stringify(mobileTemplateCategoriesMetrics)}`);
    }
    await expectMobileEditableFocusContained(mobilePage, '#template-category-name-input', '.templates-categories-body', 'Mobile template category name input');
    await mobilePage.locator('#templates-categories-close-btn').click();
    await mobilePage.locator('#templates-categories-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });

    await openMobilePanel(mobilePage, 'toggle-help', '#help-container');
    await expectElementWithinViewport(mobilePage, '#help-panel', 'Mobile help panel');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile help panel');

    await mobilePage.evaluate(async () => {
      const { appServices } = await import('./src/core/appServices.js');
      appServices.closeAllModals();
    });
    await mobilePage.locator('#help-panel.hidden').waitFor({ state: 'attached', timeout: 5000 });

    await openMobilePanel(mobilePage, 'toggle-api-settings', '#api-settings-container');
    await expectElementWithinViewport(mobilePage, '#api-settings-panel', 'Mobile API settings panel');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile API settings panel');
    await expectDarkInput(mobilePage, '#api-settings-url-input', 'Mobile API settings URL input');
    await expectMinimumTapTarget(mobilePage, '#api-settings-panel button', 'Mobile API settings controls');

    await mobilePage.evaluate(async () => {
      const { appServices } = await import('./src/core/appServices.js');
      appServices.closeAllModals();
    });
    await mobilePage.locator('#api-settings-panel.hidden').waitFor({ state: 'attached', timeout: 5000 });

    await seedLoadedResults(mobilePage);
    await mobilePage.locator('#table-with-filter').waitFor({ state: 'visible', timeout: 5000 });
    const mobileResultsLayout = await mobilePage.evaluate(() => {
      const visibleTop = selector => {
        const element = document.querySelector(selector);
        const rect = element?.getBoundingClientRect();
        const styles = element ? window.getComputedStyle(element) : null;
        return rect
          && rect.width > 0
          && rect.height > 0
          && styles?.display !== 'none'
          && styles?.visibility !== 'hidden'
          ? rect.top
          : Number.POSITIVE_INFINITY;
      };
      const tableRect = document.querySelector('#table-with-filter')?.getBoundingClientRect();
      const builderContent = document.querySelector('#mobile-builder-content');
      const builderToggle = document.querySelector('#mobile-builder-toggle');
      const mobileActionBar = document.querySelector('#mobile-table-action-bar');
      const desktopToolbar = document.querySelector('#table-toolbar');
      const filterSidePanel = document.querySelector('#filter-side-panel');
      return {
        actionBarDisplay: mobileActionBar ? window.getComputedStyle(mobileActionBar).display : '',
        actionBarPosition: mobileActionBar ? window.getComputedStyle(mobileActionBar).position : '',
        builderStageTop: visibleTop('#field-bubble-stage'),
        builderCollapsed: builderContent ? window.getComputedStyle(builderContent).display === 'none' : false,
        builderExpanded: builderToggle?.getAttribute('aria-expanded') || '',
        builderToggleDisplay: builderToggle ? window.getComputedStyle(builderToggle).display : '',
        filterPanelDisplay: filterSidePanel ? window.getComputedStyle(filterSidePanel).display : '',
        formTop: visibleTop('#form-mode-card'),
        hasLoadedData: document.body.classList.contains('has-loaded-data'),
        hasQueryColumns: document.body.classList.contains('has-query-columns'),
        searchTop: visibleTop('#field-search-section'),
        tableToolbarDisplay: desktopToolbar ? window.getComputedStyle(desktopToolbar).display : '',
        tableTop: tableRect?.top ?? Number.POSITIVE_INFINITY
      };
    });
    if (
      !mobileResultsLayout.hasLoadedData
      || !mobileResultsLayout.hasQueryColumns
      || mobileResultsLayout.tableTop > mobileResultsLayout.formTop + 1
      || mobileResultsLayout.tableTop > mobileResultsLayout.builderStageTop + 1
      || mobileResultsLayout.tableTop > mobileResultsLayout.searchTop + 1
    ) {
      throw new Error(`Mobile table should be the first main-screen surface once display fields exist: ${JSON.stringify(mobileResultsLayout)}`);
    }
    if (
      mobileResultsLayout.actionBarDisplay === 'none'
      || mobileResultsLayout.actionBarPosition !== 'sticky'
      || mobileResultsLayout.builderToggleDisplay === 'none'
      || !mobileResultsLayout.builderCollapsed
      || mobileResultsLayout.builderExpanded !== 'false'
      || mobileResultsLayout.filterPanelDisplay !== 'none'
      || mobileResultsLayout.tableToolbarDisplay !== 'none'
    ) {
      throw new Error(`Mobile table should use a sticky action bar and collapsed builder drawer: ${JSON.stringify(mobileResultsLayout)}`);
    }
    await expectControlsNonSelectable(mobilePage, '#table-with-filter', 'Mobile table controls');
    await expectMobileTableTextNonSelectable(mobilePage);
    await expectMobileTableContextMenu(mobilePage);
    await expectMobileHeaderDragDoesNotOpenContextMenu(mobilePage);
    const mobileTableDensityMetrics = await mobilePage.locator('#table-container').evaluate(container => {
      const table = document.querySelector('#example-table');
      const cell = document.querySelector('#example-table tbody td');
      const containerRect = container.getBoundingClientRect();
      const tableRect = table?.getBoundingClientRect();
      const cellStyle = cell ? window.getComputedStyle(cell) : null;
      return {
        cellFontSize: cellStyle ? Number.parseFloat(cellStyle.fontSize) : 0,
        containerWidth: containerRect.width,
        tableWidth: tableRect?.width || 0
      };
    });
    if (
      mobileTableDensityMetrics.tableWidth > mobileTableDensityMetrics.containerWidth + 4
      || mobileTableDensityMetrics.cellFontSize < 11.2
      || mobileTableDensityMetrics.cellFontSize > 12.5
    ) {
      throw new Error(`Mobile table should use balanced compact density so more columns are visible without making text too small: ${JSON.stringify(mobileTableDensityMetrics)}`);
    }
    const mobileHeaderLabelMetrics = await mobilePage.locator('#example-table thead').evaluate(thead => {
      return Array.from(thead.querySelectorAll('.th-text')).map(label => {
        const style = window.getComputedStyle(label);
        const headerRect = label.closest('th')?.getBoundingClientRect();
        return {
          clientWidth: label.clientWidth,
          headerHeight: headerRect?.height || 0,
          scrollWidth: label.scrollWidth,
          text: label.textContent || '',
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace
        };
      });
    });
    const truncatedMobileHeader = mobileHeaderLabelMetrics.find(label => (
      label.textOverflow === 'ellipsis'
      || label.whiteSpace === 'nowrap'
      || label.scrollWidth - label.clientWidth > 1
      || label.headerHeight <= 0
    ));
    if (truncatedMobileHeader) {
      throw new Error(`Mobile table headers should wrap instead of truncating with ellipsis: ${JSON.stringify(mobileHeaderLabelMetrics)}`);
    }
    await expectMinimumTapTarget(mobilePage, '#mobile-table-action-bar .mobile-table-action', 'Mobile table action bar controls');
    const mobileActionLabels = await mobilePage.locator('#mobile-table-action-bar .mobile-table-action').evaluateAll(buttons => {
      return buttons.map(button => (button.textContent || '').trim().replace(/\s+/gu, ' '));
    });
    ['Run', 'Fields', 'Add', 'Filters', 'Export', 'Expand', 'Clear'].forEach(expectedLabel => {
      if (!mobileActionLabels.includes(expectedLabel)) {
        throw new Error(`Mobile table action bar is missing "${expectedLabel}": ${JSON.stringify(mobileActionLabels)}`);
      }
    });
    const mobileActionBarMetrics = await mobilePage.locator('#mobile-table-action-bar').evaluate(element => ({
      clientWidth: element.clientWidth,
      height: element.getBoundingClientRect().height,
      scrollWidth: element.scrollWidth
    }));
    if (mobileActionBarMetrics.scrollWidth - mobileActionBarMetrics.clientWidth > 2 || mobileActionBarMetrics.height > 128) {
      throw new Error(`Mobile table action bar should show all actions without horizontal scrolling: ${JSON.stringify(mobileActionBarMetrics)}`);
    }
    await expectMobileHeaderDoesNotCoverTableOnScroll(mobilePage, 'Mobile header and table');
    await expectMobileColumnResizeInteraction(mobilePage);
    await expectMinimumTapTarget(mobilePage, '#mobile-builder-toggle', 'Mobile builder drawer toggle');

    await mobilePage.locator('#mobile-builder-toggle').click();
    await mobilePage.waitForFunction(() => {
      const content = document.querySelector('#mobile-builder-content');
      return content && window.getComputedStyle(content).display !== 'none';
    }, null, { timeout: 5000 });
    const mobileBuilderOpenLayout = await mobilePage.evaluate(() => {
      const tableRect = document.querySelector('#table-with-filter')?.getBoundingClientRect();
      const builderRect = document.querySelector('#mobile-builder-drawer')?.getBoundingClientRect();
      return {
        builderExpanded: document.querySelector('#mobile-builder-toggle')?.getAttribute('aria-expanded') || '',
        builderTop: builderRect?.top ?? 0,
        tableTop: tableRect?.top ?? 0
      };
    });
    if (mobileBuilderOpenLayout.builderExpanded !== 'true' || mobileBuilderOpenLayout.builderTop < mobileBuilderOpenLayout.tableTop - 1) {
      throw new Error(`Mobile builder drawer should expand below the table: ${JSON.stringify(mobileBuilderOpenLayout)}`);
    }
    await mobilePage.locator('#mobile-builder-toggle').click();

    await primeMobilePageScroll(mobilePage);
    await mobilePage.locator('[data-mobile-table-action="fields-panel"]').click();
    await mobilePage.waitForFunction(() => document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#filter-side-panel', 'Mobile display and filters sheet');
    await expectControlsNonSelectable(mobilePage, '#filter-side-panel', 'Mobile display and filters controls');
    await expectOverlayConsumesScroll(mobilePage, '#filter-panel-body', 'Mobile display and filters sheet');
    await expectOverlayTouchPanScroll(
      mobilePage,
      mobilePage.locator('.fp-display-item', { hasText: 'Smoke Title' }),
      '#filter-panel-body',
      'Mobile display and filters sheet'
    );
    await expectMinimumTapTarget(mobilePage, '#filter-panel-mobile-close', 'Mobile display and filters close button');
    const mobileFilterSheetMetrics = await mobilePage.locator('#filter-side-panel').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const body = document.querySelector('#filter-panel-body');
      return {
        bottomGap: Math.abs(window.innerHeight - rect.bottom),
        bodyText: (body?.textContent || '').trim().replace(/\s+/gu, ' '),
        display: window.getComputedStyle(element).display,
        position: window.getComputedStyle(element).position,
        top: rect.top
      };
    });
    if (
      mobileFilterSheetMetrics.position !== 'fixed'
      || mobileFilterSheetMetrics.display === 'none'
      || mobileFilterSheetMetrics.top < 48
      || mobileFilterSheetMetrics.bottomGap > 24
      || !/Smoke Title/u.test(mobileFilterSheetMetrics.bodyText)
    ) {
      throw new Error(`Mobile display and filters should open as a usable sheet: ${JSON.stringify(mobileFilterSheetMetrics)}`);
    }
    await expectNoHorizontalOverflow(mobilePage, 'Mobile display and filters sheet');
    const reorderHandleCount = await mobilePage.locator('.fp-display-drag, .fp-drag-handle').count();
    if (reorderHandleCount !== 0) {
      throw new Error(`Display & Filters should not expose separate dot drag handles: found ${reorderHandleCount}`);
    }

    await dragTouchLocatorToLocator(
      mobilePage,
      mobilePage.locator('.fp-display-item', { hasText: 'Smoke Title' }),
      mobilePage.locator('.fp-display-item', { hasText: 'Smoke Status' }),
      { expectPreview: true, targetVerticalRatio: 0.85 }
    );
    await mobilePage.waitForFunction(async () => {
      const { QueryStateReaders } = await import('./src/core/queryState.js');
      return QueryStateReaders.getDisplayedFields().join('|') === 'Smoke Branch|Smoke Status|Smoke Title';
    }, null, { timeout: 5000 });

    await mobilePage.evaluate(async () => {
      const { QueryChangeManager } = await import('./src/core/queryState.js');
      QueryChangeManager.setQueryState({
        activeFilters: {
          'Smoke Title': { filters: [{ cond: 'contains', val: 'Alpha' }] },
          'Smoke Branch': { filters: [{ cond: 'equals', val: 'Main' }] },
          'Smoke Status': { filters: [{ cond: 'equals', val: 'Open' }] }
        }
      }, { source: 'BrowserSmoke.seedMobileFilterGroups' });
    });
    await mobilePage.waitForFunction(() => document.querySelectorAll('.fp-field-group').length >= 3, null, { timeout: 5000 });
    await expectMobileFilterEditorSheet(mobilePage);
    await primeMobilePageScroll(mobilePage);
    await mobilePage.locator('[data-mobile-table-action="fields-panel"]').click();
    await mobilePage.waitForFunction(() => document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
    await dragTouchLocatorToLocator(
      mobilePage,
      mobilePage.locator('.fp-field-group', { hasText: 'Smoke Title' }),
      mobilePage.locator('.fp-field-group', { hasText: 'Smoke Status' }),
      { expectPreview: true, targetVerticalRatio: 0.85 }
    );
    await mobilePage.waitForFunction(async () => {
      const { QueryStateReaders } = await import('./src/core/queryState.js');
      return Object.keys(QueryStateReaders.getActiveFilters()).join('|') === 'Smoke Branch|Smoke Status|Smoke Title';
    }, null, { timeout: 5000 });
    await mobilePage.evaluate(async ({ headers }) => {
      const { QueryChangeManager } = await import('./src/core/queryState.js');
      QueryChangeManager.setQueryState({
        activeFilters: {},
        displayedFields: headers
      }, { source: 'BrowserSmoke.resetMobileReorderState' });
    }, { headers: smokeResultHeaders });

    await mobilePage.locator('#filter-panel-mobile-close').click();
    await mobilePage.waitForFunction(() => !document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
    await expectMobileScrollLockReleased(mobilePage, 'Mobile display and filters sheet');
    await cleanupMobilePageScroll(mobilePage);
    const closedMobileFilterDisplay = await mobilePage.locator('#filter-side-panel').evaluate(element => window.getComputedStyle(element).display);
    if (closedMobileFilterDisplay !== 'none') {
      throw new Error(`Closed mobile display and filters sheet should not sit above the table: ${closedMobileFilterDisplay}`);
    }

    await primeMobilePageScroll(mobilePage);
    await mobilePage.locator('[data-mobile-table-action-target="table-add-field-btn"]').click();
    await mobilePage.locator('.form-mode-field-picker-modal:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '.form-mode-field-picker-modal:not(.hidden)', 'Mobile add field dialog');
    await expectOverlayConsumesScroll(mobilePage, '.form-mode-field-picker-list', 'Mobile add field dialog');
    await expectLightInput(mobilePage, '.form-mode-field-picker-search-field input[type="search"]', 'Mobile add field search input');
    await expectMinimumTapTarget(mobilePage, '.form-mode-field-picker-close, .form-mode-field-picker-category-select, .form-mode-field-picker-option', 'Mobile add field controls');
    const mobileAddFieldMetrics = await mobilePage.locator('.form-mode-field-picker-modal:not(.hidden)').evaluate(modal => {
      const modalRect = modal.getBoundingClientRect();
      const listRect = modal.querySelector('.form-mode-field-picker-list')?.getBoundingClientRect();
      const detailsRect = modal.querySelector('.form-mode-field-picker-details')?.getBoundingClientRect();
      const footer = modal.querySelector('.form-mode-field-picker-footer');
      return {
        bottomGap: Math.abs(window.innerHeight - modalRect.bottom),
        detailsHeight: detailsRect?.height || 0,
        detailsTop: detailsRect?.top || 0,
        footerDisplay: footer ? window.getComputedStyle(footer).display : '',
        listBottom: listRect?.bottom || 0,
        listHeight: listRect?.height || 0,
        top: modalRect.top,
        viewportHeight: window.innerHeight
      };
    });
    if (
      mobileAddFieldMetrics.top > 16
      || mobileAddFieldMetrics.bottomGap > 16
      || mobileAddFieldMetrics.footerDisplay !== 'none'
      || mobileAddFieldMetrics.listHeight < 240
      || mobileAddFieldMetrics.detailsHeight > mobileAddFieldMetrics.viewportHeight * 0.42
      || mobileAddFieldMetrics.listBottom > mobileAddFieldMetrics.detailsTop + 1
    ) {
      throw new Error(`Mobile add field picker should be a non-overlapping full-height sheet: ${JSON.stringify(mobileAddFieldMetrics)}`);
    }
    await expectNoHorizontalOverflow(mobilePage, 'Mobile add field dialog');
    await mobilePage.locator('.form-mode-field-picker-close').click();
    await expectMobileScrollLockReleased(mobilePage, 'Mobile add field dialog');
    await cleanupMobilePageScroll(mobilePage);

    const mobileRunAction = mobilePage.locator('[data-mobile-table-action-target="run-query-btn"]');
    const mobileRunDisabled = await mobileRunAction.evaluate(button => button.disabled);
    if (mobileRunDisabled) {
      throw new Error('Mobile run action is disabled after seeding display fields');
    }
    mobileQueryApiStub.enqueue({
      body: buildJsonlResultStream({
        queryId: 'mobile-run-smoke',
        rows: [['Mobile run result', 'Main', 'Open']]
      }),
      contentType: 'application/x-ndjson; charset=utf-8',
      rawColumns: smokeResultHeaders
    });
    await mobileRunAction.click();
    await mobilePage.waitForFunction(() => {
      return document.querySelector('#table-results-count')?.textContent?.trim() === '1';
    }, null, { timeout: 5000 });

    await mobilePage.locator('[data-mobile-table-action-target="table-expand-btn"]').click();
    await mobilePage.waitForFunction(() => document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#table-shell.table-shell-expanded', 'Mobile expanded table');
    const mobileExpandedTableMetrics = await mobilePage.locator('#table-shell.table-shell-expanded').evaluate(shell => {
      const topBar = shell.querySelector('#table-top-bar');
      const toolbar = shell.querySelector('#table-toolbar');
      const container = shell.querySelector('#table-container');
      const table = shell.querySelector('#example-table');
      const nameShell = shell.querySelector('#table-name-shell');
      const zoomControls = shell.querySelector('#table-zoom-controls');
      const visibleToolbarItems = Array.from(toolbar?.children || [])
        .filter(child => {
          const rect = child.getBoundingClientRect();
          const style = window.getComputedStyle(child);
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width > 0
            && rect.height > 0;
        })
        .map(child => child.id || child.className || child.tagName);
      const shellRect = shell.getBoundingClientRect();
      const topBarRect = topBar?.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();
      const tableRect = table?.getBoundingClientRect();
      const zoomStyle = zoomControls ? window.getComputedStyle(zoomControls) : null;
      const nameStyle = nameShell ? window.getComputedStyle(nameShell) : null;
      return {
        containerHeight: containerRect?.height || 0,
        containerTop: containerRect?.top || 0,
        containerWidth: containerRect?.width || 0,
        shellBottomGap: Math.abs(window.innerHeight - (shellRect?.bottom || 0)),
        shellTop: shellRect?.top || 0,
        tableWidth: tableRect?.width || 0,
        tableZoom: shell.style.getPropertyValue('--table-zoom') || '',
        topBarHeight: topBarRect?.height || 0,
        visibleToolbarItems,
        viewportHeight: window.innerHeight,
        zoomDisplay: zoomStyle?.display || '',
        nameDisplay: nameStyle?.display || ''
      };
    });
    if (
      mobileExpandedTableMetrics.topBarHeight > 70
      || mobileExpandedTableMetrics.containerTop > 88
      || mobileExpandedTableMetrics.containerHeight < mobileExpandedTableMetrics.viewportHeight - 110
      || mobileExpandedTableMetrics.tableWidth > mobileExpandedTableMetrics.containerWidth + 4
      || mobileExpandedTableMetrics.shellTop > 10
      || mobileExpandedTableMetrics.shellBottomGap > 10
      || mobileExpandedTableMetrics.zoomDisplay === 'none'
      || mobileExpandedTableMetrics.nameDisplay !== 'none'
      || mobileExpandedTableMetrics.tableZoom !== '0.90'
      || mobileExpandedTableMetrics.visibleToolbarItems.join('|') !== 'table-zoom-controls|table-expand-btn'
    ) {
      throw new Error(`Mobile expanded table should use compact full-screen chrome: ${JSON.stringify(mobileExpandedTableMetrics)}`);
    }
    await mobilePage.locator('#table-expand-btn').click();
    await mobilePage.waitForFunction(() => !document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });

    await primeMobilePageScroll(mobilePage);
    await mobilePage.locator('[data-mobile-table-action-target="post-filter-btn"]').click();
    await mobilePage.locator('#post-filter-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#post-filter-overlay .post-filter-dialog', 'Mobile post filter dialog');
    await expectOverlayConsumesScroll(mobilePage, '.post-filter-dialog__body', 'Mobile post filter dialog');
    await expectMinimumTapTarget(mobilePage, '#post-filter-overlay .post-filter-dialog__close, #post-filter-field, #post-filter-operator, #post-filter-logic, #post-filter-add-btn, #post-filter-clear-btn, #post-filter-done-btn', 'Mobile post filter controls');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile post filter dialog');
    await expectMobileEditableFocusContained(mobilePage, '#post-filter-operator', '.post-filter-dialog__body', 'Mobile post filter operator');

    await mobilePage.locator('#post-filter-operator').selectOption('equals');
    await mobilePage.locator('#post-filter-value-picker-host .form-mode-popup-list-trigger').waitFor({ state: 'visible', timeout: 5000 });
    await expectMinimumTapTarget(mobilePage, '#post-filter-value-picker-host .form-mode-popup-list-trigger', 'Mobile post filter value picker trigger');
    await mobilePage.locator('#post-filter-value-picker-host .form-mode-popup-list-trigger').click();
    await mobilePage.locator('.form-mode-popup-list-popup:not([hidden])').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '.form-mode-popup-list-popup:not([hidden])', 'Mobile popup list picker');
    await expectLightInput(mobilePage, '.form-mode-popup-list-popup input[type="search"]', 'Mobile popup list search input');
    const popupAutoFocus = await mobilePage.locator('.form-mode-popup-list-popup:not([hidden])').evaluate(popup => {
      const active = document.activeElement;
      return {
        activeClass: String(active?.className || ''),
        activeTag: active?.tagName || '',
        popupFocused: active === popup
      };
    });
    if (!popupAutoFocus.popupFocused || ['INPUT', 'TEXTAREA', 'SELECT'].includes(popupAutoFocus.activeTag)) {
      throw new Error(`Mobile popup list should open without auto-focusing a text control: ${JSON.stringify(popupAutoFocus)}`);
    }
    await expectMobileEditableFocusContained(mobilePage, '.form-mode-popup-list-popup input[type="search"]', '.form-mode-popup-list-popup-body', 'Mobile popup list search input');
    await expectMinimumTapTarget(mobilePage, '.form-mode-popup-list-done', 'Mobile popup list done control');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile popup list picker');
    await mobilePage.locator('.form-mode-popup-list-done').click();
    await mobilePage.locator('#post-filter-done-btn').click();
    await expectMobileScrollLockReleased(mobilePage, 'Mobile post filter dialog');
    await cleanupMobilePageScroll(mobilePage);

    await seedLoadedResults(mobilePage, { rowCount: 3 });
    const mobileExportAction = mobilePage.locator('[data-mobile-table-action-target="download-btn"]');
    await mobileExportAction.scrollIntoViewIfNeeded();
    const downloadDisabled = await mobileExportAction.evaluate(button => button.disabled);
    if (downloadDisabled) {
      throw new Error('Download button is disabled after seeding loaded mobile results');
    }
    await primeMobilePageScroll(mobilePage);
    await openExportOverlayPromptly(mobilePage, '[data-mobile-table-action-target="download-btn"]', 'Mobile export action');
    await expectElementWithinViewport(mobilePage, '#export-overlay .export-dialog', 'Mobile export dialog');
    await waitForExportOptionsReady(mobilePage, 'Mobile export dialog');
    await expectOverlayConsumesScroll(mobilePage, '.export-dialog__body', 'Mobile export dialog');
    await expectMinimumTapTarget(mobilePage, '#export-overlay-close, #export-cancel-btn, #export-confirm-btn', 'Mobile export dialog controls');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile export dialog');
    await waitForGroupedExportAvailable(mobilePage, 'Mobile export dialog');
    await mobilePage.locator('[data-export-mode-card="grouped"]').click();
    await expectMobileEditableFocusContained(mobilePage, '#export-group-field', '.export-dialog__body', 'Mobile export group field select');
    await mobilePage.locator('#export-cancel-btn').click();
    await expectMobileScrollLockReleased(mobilePage, 'Mobile export dialog');
    await cleanupMobilePageScroll(mobilePage);

    if (failures.length > 0) {
      throw new Error(`Browser smoke test failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
    }

  } finally {
    if (browser) {
      await browser.close();
    }
    await closeServer(server);
  }
}

test('browser smoke', { timeout: 120000 }, runSmokeTest);
