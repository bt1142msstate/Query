/**
 * Table Context Menu
 * Right-click menu on table cells and headers.
 * Options: Copy Cell, Copy Row (tab-separated), Copy Column (newline-separated).
 */
import { ClipboardUtils } from '../core/clipboard.js';
import { appServices } from '../core/appServices.js';
import { appUiActions } from '../core/appUiActions.js';
import { QueryStateReaders } from '../core/queryState.js';
import { showToastMessage } from '../core/toast.js';
import { FormatUtils } from '../core/utils.js';
import { VisibilityUtils } from '../core/visibility.js';
import { SharedFieldPicker } from '../ui/field-picker/fieldPicker.js';

(() => {
  let menuEl = null;
  let dismissHandlers = [];
  let clearPreview = null;
  let touchContextState = null;
  let suppressTableClickUntil = 0;
  let suppressTouchContextMenuUntil = 0;
  let lastTouchContextActivityUntil = 0;
  const services = appServices;
  const TOUCH_CONTEXT_CELL_DELAY = 420;
  const TOUCH_CONTEXT_CELL_MOVE_TOLERANCE = 12;
  const TOUCH_CONTEXT_HEADER_DELAY = 650;
  const TOUCH_CONTEXT_HEADER_MOVE_TOLERANCE = 6;
  const TOUCH_CONTEXT_SUPPRESSION_MS = 900;
  const TOUCH_CONTEXT_ACTIVITY_MS = 1600;

  // ── Data helpers ────────────────────────────────────────────────────────────

  function getVT() {
    return services.getVirtualTableData();
  }

  function getFields() {
    return QueryStateReaders?.getDisplayedFields?.() || [];
  }

  function formatCellValue(raw, field) {
    return FormatUtils.formatCellDisplay(raw, field);
  }

  function getCellValue(rowIndex, colIndex) {
    const vt = getVT();
    const fields = getFields();
    if (!vt || !fields.length) return '';
    const field = fields[colIndex];
    if (!field) return '';
    const dataColIdx = vt.columnMap.get(field);
    if (dataColIdx === undefined) return '';
    return formatCellValue(vt.rows[rowIndex]?.[dataColIdx], field);
  }

  function getRowValues(rowIndex) {
    const vt = getVT();
    const fields = getFields();
    if (!vt || !fields.length) return [];
    return fields.map(field => {
      const dataColIdx = vt.columnMap.get(field);
      if (dataColIdx === undefined) return '';
      return formatCellValue(vt.rows[rowIndex]?.[dataColIdx], field);
    });
  }

  function getColumnValues(colIndex) {
    const vt = getVT();
    const fields = getFields();
    if (!vt || !fields.length) return [];
    const field = fields[colIndex];
    if (!field) return [];
    const dataColIdx = vt.columnMap.get(field);
    if (dataColIdx === undefined) return [];
    return vt.rows.map(row => formatCellValue(row[dataColIdx], field));
  }

  // For cells that don't have a row index (shouldn't happen in practice but safe fallback)
  function getCellFallbackText(td) {
    return td.getAttribute('data-tooltip') || td.textContent || '';
  }

  function isNodeInsideTable(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(element?.closest?.('#example-table'));
  }

  function clearTableTextSelection() {
    const selection = window.getSelection?.();
    if (!selection?.rangeCount) {
      return;
    }

    if (isNodeInsideTable(selection.anchorNode) || isNodeInsideTable(selection.focusNode)) {
      selection.removeAllRanges();
    }
  }

  // ── SVG icons ────────────────────────────────────────────────────────────────

  const CELL_ICON = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="5" y="5" width="9" height="10" rx="1.5"/>
    <path d="M4 11H3a1.5 1.5 0 01-1.5-1.5v-7A1.5 1.5 0 013 1h7A1.5 1.5 0 0111.5 2.5V4"/>
  </svg>`;

  const ROW_ICON = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="1" y="5" width="14" height="6" rx="1.5"/>
    <line x1="6" y1="5" x2="6" y2="11"/>
    <line x1="10" y1="5" x2="10" y2="11"/>
  </svg>`;

  const COL_ICON = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="5" y="1" width="6" height="14" rx="1.5"/>
    <line x1="5" y1="6" x2="11" y2="6"/>
    <line x1="5" y1="10" x2="11" y2="10"/>
  </svg>`;

  const SORT_ICON = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 2v11"/>
    <path d="M3 4l2-2 2 2"/>
    <path d="M11 14V3"/>
    <path d="M9 12l2 2 2-2"/>
  </svg>`;

  const FILTER_ICON = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 3h12l-5 5v4l-2 1V8L2 3z"/>
  </svg>`;

  const RESIZE_ICON = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 3v10"/>
    <path d="M11 3v10"/>
    <path d="M2 8h3"/>
    <path d="M11 8h3"/>
    <path d="M3.5 6.5 2 8l1.5 1.5"/>
    <path d="M12.5 6.5 14 8l-1.5 1.5"/>
  </svg>`;

  function clearTablePreviewClasses() {
    document.querySelectorAll('.tcm-preview-cell, .tcm-preview-row, .tcm-preview-column, .tcm-preview-column-header').forEach(node => {
      node.classList.remove('tcm-preview-cell', 'tcm-preview-row', 'tcm-preview-column', 'tcm-preview-column-header');
    });
  }

  function previewCell(td) {
    clearTablePreviewClasses();
    td?.classList.add('tcm-preview-cell');
    return clearTablePreviewClasses;
  }

  function previewRow(tr) {
    clearTablePreviewClasses();
    tr?.classList.add('tcm-preview-row');
    tr?.querySelectorAll('td').forEach(td => td.classList.add('tcm-preview-row'));
    return clearTablePreviewClasses;
  }

  function previewColumn(colIndex) {
    clearTablePreviewClasses();
    if (Number.isNaN(colIndex)) {
      return clearTablePreviewClasses;
    }

    document.querySelector(`#example-table thead th[data-col-index="${colIndex}"]`)?.classList.add('tcm-preview-column-header');
    document.querySelectorAll(`#example-table tbody td[data-col-index="${colIndex}"]`).forEach(td => {
      td.classList.add('tcm-preview-column');
    });

    return clearTablePreviewClasses;
  }

  // ── Menu DOM ─────────────────────────────────────────────────────────────────

  function buildMenu(actions) {
    const menu = document.createElement('div');
    menu.className = 'tcm';
    menu.setAttribute('role', 'menu');

    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.className = 'tcm-item';
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML =
        `<span class="tcm-icon">${action.icon}</span>` +
        `<span class="tcm-label">${action.label}</span>` +
        (action.hint ? `<span class="tcm-hint">${action.hint}</span>` : '');
      const runPreview = () => {
        if (typeof clearPreview === 'function') {
          clearPreview();
          clearPreview = null;
        }

        if (typeof action.preview === 'function') {
          clearPreview = action.preview() || null;
        }
      };
      btn.addEventListener('mouseenter', runPreview);
      btn.addEventListener('focus', runPreview);
      btn.addEventListener('mouseleave', () => {
        if (typeof clearPreview === 'function') {
          clearPreview();
          clearPreview = null;
        }
      });
      btn.addEventListener('click', () => {
        dismiss();
        window.requestAnimationFrame(() => {
          action.run();
        });
      });
      menu.appendChild(btn);
    });

    return menu;
  }

  function getViewportBounds() {
    const visualViewport = window.visualViewport;
    if (visualViewport) {
      const width = Math.min(visualViewport.width, window.innerWidth);
      const height = Math.min(visualViewport.height, window.innerHeight);
      return {
        bottom: height,
        height,
        left: 0,
        right: width,
        top: 0,
        width
      };
    }

    return {
      bottom: window.innerHeight,
      height: window.innerHeight,
      left: 0,
      right: window.innerWidth,
      top: 0,
      width: window.innerWidth
    };
  }

  function clampMenuCoordinate(value, min, max) {
    return Math.max(min, Math.min(value, Math.max(min, max)));
  }

  function nudgeMenuIntoLayoutViewport(menu, pad) {
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let deltaX = 0;
    let deltaY = 0;

    if (rect.right > viewportWidth - pad) {
      deltaX = viewportWidth - pad - rect.right;
    }
    if (rect.left + deltaX < pad) {
      deltaX += pad - (rect.left + deltaX);
    }
    if (rect.bottom > viewportHeight - pad) {
      deltaY = viewportHeight - pad - rect.bottom;
    }
    if (rect.top + deltaY < pad) {
      deltaY += pad - (rect.top + deltaY);
    }

    if (deltaX || deltaY) {
      const currentLeft = Number.parseFloat(menu.style.left || '0') || 0;
      const currentTop = Number.parseFloat(menu.style.top || '0') || 0;
      menu.style.left = `${currentLeft + deltaX}px`;
      menu.style.top = `${currentTop + deltaY}px`;
    }
  }

  function positionMenu(menu, mouseX, mouseY, options = {}) {
    // Append off-screen first so we can measure its natural size
    const wasHidden = menu.hidden;
    const hadHiddenClass = menu.classList.contains('hidden');
    const previousVisibility = menu.style.visibility;
    const previousPointerEvents = menu.style.pointerEvents;
    const previousTransform = menu.style.transform;
    menu.hidden = false;
    menu.classList.remove('hidden');
    menu.style.visibility = 'hidden';
    menu.style.pointerEvents = 'none';
    menu.style.transform = 'none';
    menu.style.left = '-9999px';
    menu.style.top  = '-9999px';
    menu.style.removeProperty('max-height');
    menu.style.removeProperty('overflow-y');
    document.body.appendChild(menu);

    const bounds = getViewportBounds();
    const isTouchMenu = options.source === 'touch';
    const pad = isTouchMenu ? 12 : 8;
    const maxHeight = Math.max(160, bounds.height - (pad * 2));
    menu.style.maxHeight = `${maxHeight}px`;
    menu.style.overflowY = 'auto';

    const { width, height } = menu.getBoundingClientRect();
    const minLeft = bounds.left + pad;
    const maxLeft = bounds.right - width - pad;
    const minTop = bounds.top + pad;
    const maxTop = bounds.bottom - height - pad;
    const fallbackX = bounds.left + (bounds.width / 2);
    const fallbackY = bounds.top + (bounds.height / 2);
    const anchorX = Number.isFinite(mouseX) && mouseX > 0 ? mouseX : fallbackX;
    const anchorY = Number.isFinite(mouseY) && mouseY > 0 ? mouseY : fallbackY;

    let left = isTouchMenu ? anchorX - (width / 2) : anchorX;
    let top = anchorY;
    if (isTouchMenu) {
      const touchGap = 14;
      const belowTop = anchorY + touchGap;
      const aboveTop = anchorY - height - touchGap;
      top = belowTop + height <= bounds.bottom - pad ? belowTop : aboveTop;
    }

    left = clampMenuCoordinate(left, minLeft, maxLeft);
    top = clampMenuCoordinate(top, minTop, maxTop);
    menu.style.left = `${left}px`;
    menu.style.top  = `${top}px`;
    nudgeMenuIntoLayoutViewport(menu, pad);
    const finalLeft = Number.parseFloat(menu.style.left || `${left}`) || left;
    const finalTop = Number.parseFloat(menu.style.top || `${top}`) || top;
    menu.style.transformOrigin = `${clampMenuCoordinate(anchorX - finalLeft, 0, width)}px ${clampMenuCoordinate(anchorY - finalTop, 0, height)}px`;
    menu.style.visibility = previousVisibility;
    menu.style.pointerEvents = previousPointerEvents;
    menu.style.transform = previousTransform;
    menu.hidden = wasHidden;
    menu.classList.toggle('hidden', hadHiddenClass);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  function dismiss() {
    if (typeof clearPreview === 'function') {
      clearPreview();
      clearPreview = null;
    }
    if (menuEl) {
      VisibilityUtils.hide([menuEl], {
        ariaHidden: true,
        raisedUiKey: 'table-context-menu'
      });
      menuEl.classList.add('tcm--hiding');
      const el = menuEl;
      menuEl = null;
      setTimeout(() => el.remove(), 160);
    }
    dismissHandlers.forEach(fn => fn());
    dismissHandlers = [];
  }

  function attachDismissListeners(menu) {
    const onDown   = ev => {
      if (Date.now() <= suppressTableClickUntil && ev.target.closest?.('#example-table')) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }

      if (!menu.contains(ev.target)) dismiss();
    };
    const onKey    = ev => { if (ev.key === 'Escape') { ev.preventDefault(); dismiss(); } };
    const onScroll = () => dismiss();

    // Defer so the right-click event itself doesn't immediately close the menu
    setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('pointerdown', onDown);
      document.addEventListener('keydown', onKey);
      window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    }, 0);

    dismissHandlers = [
      () => document.removeEventListener('mousedown', onDown),
      () => document.removeEventListener('pointerdown', onDown),
      () => document.removeEventListener('keydown', onKey),
      () => window.removeEventListener('scroll', onScroll, { capture: true }),
    ];
  }

  // ── Entry point ───────────────────────────────────────────────────────────────

  function getContextTarget(target) {
    const headerCell = target?.closest?.('#example-table thead th[data-col-index]') || null;
    const bodyCell = target?.closest?.('#example-table tbody td[data-col-index]') || null;
    const targetCell = bodyCell || headerCell;
    if (!targetCell) {
      return null;
    }

    const tr = bodyCell?.closest('tr') || null;
    const colIndex = parseInt(targetCell.dataset.colIndex, 10);
    const rowIndex = parseInt(tr?.dataset?.rowIndex ?? 'NaN', 10);

    if (Number.isNaN(colIndex)) {
      return null;
    }

    return {
      bodyCell,
      colIndex,
      headerCell,
      rowIndex,
      targetCell,
      tr
    };
  }

  function isTableContextInteractiveTarget(target) {
    return Boolean(target?.closest?.([
      'button',
      'input',
      'select',
      'textarea',
      'a[href]',
      '[role="button"]',
      '[contenteditable="true"]',
      '.th-resize-handle',
      '.th-insert-button',
      '.table-scrollbar',
      '.table-scrollbar-thumb',
      '.table-scrollbar-track'
    ].join(', ')));
  }

  function openContextMenuForTarget(target, mouseX, mouseY, options = {}) {
    const contextTarget = getContextTarget(target);
    if (!contextTarget) return false;

    dismiss();
    if (options.source === 'touch') {
      clearTableTextSelection();
    }

    const {
      bodyCell,
      colIndex,
      headerCell,
      rowIndex,
      tr
    } = contextTarget;

    const fields   = getFields();
    const field    = fields[colIndex];
    const colLabel = field
      ? (field.length > 24 ? field.slice(0, 22) + '\u2026' : field)
      : `Column ${colIndex + 1}`;

    const hasRow = !isNaN(rowIndex);
    const isHeaderTarget = Boolean(headerCell && !bodyCell);
    const sortState = services.getVirtualTableState?.() || {};
    const isActiveSort = Boolean(field) && String(sortState.currentSortColumn || '') === field;
    const nextSortLabel = !field
      ? 'Sort Column'
      : (isActiveSort && String(sortState.currentSortDirection || 'asc') === 'asc'
        ? 'Sort Descending'
        : 'Sort Ascending');

    const actions = [
      {
        icon:  SORT_ICON,
        label: nextSortLabel,
        hint:  colLabel,
        preview() {
          return previewColumn(colIndex);
        },
        run() {
          if (!field) return;
          services.sortTableBy(field);
        }
      },
      {
        icon:  FILTER_ICON,
        label: 'Add Filter',
        hint:  colLabel,
        preview() {
          return previewColumn(colIndex);
        },
        run() {
          if (!field) {
            return;
          }
          SharedFieldPicker.openQueryFilterEditor(field);
        }
      },
      {
        icon:  FILTER_ICON,
        label: 'Add Post Filter',
        hint:  colLabel,
        preview() {
          return previewColumn(colIndex);
        },
        run() {
          if (!field) {
            return;
          }

          appUiActions.openPostFilterOverlayForField(field);
        }
      },
      ...(!isHeaderTarget ? [
        {
          icon:  CELL_ICON,
          label: 'Copy Cell',
          hint:  '',
          preview() {
            return previewCell(bodyCell);
          },
          run() {
            const val = hasRow
              ? getCellValue(rowIndex, colIndex)
              : getCellFallbackText(bodyCell);
            ClipboardUtils.copy(val, { successMessage: 'Cell copied' });
          }
        },
        {
          icon:  ROW_ICON,
          label: 'Copy Row',
          hint:  'tab-separated',
          preview() {
            return hasRow ? previewRow(tr) : null;
          },
          run() {
            if (!hasRow) return;
            const vals = getRowValues(rowIndex);
            ClipboardUtils.copy(vals.join('\t'), {
              successMessage: `Row copied \u2014 ${vals.length} value${vals.length !== 1 ? 's' : ''}`
            });
          }
        }
      ] : []),
      {
        icon:  COL_ICON,
        label: 'Copy Column',
        hint:  colLabel,
        preview() {
          return previewColumn(colIndex);
        },
        run() {
          const vals = getColumnValues(colIndex);
          if (!vals.length) return;
          ClipboardUtils.copy(vals.join('\n'), {
            successMessage: `Column copied \u2014 ${vals.length} row${vals.length !== 1 ? 's' : ''}`
          });
        }
      },
      {
        icon: RESIZE_ICON,
        label: 'Resize Column',
        hint: colLabel,
        preview() {
          return previewColumn(colIndex);
        },
        run() {
          if (!field) return;
          const activated = services.activateColumnResizeMode?.(field);
          if (activated) {
            showToastMessage(`Resize mode active for ${field}. Drag the highlighted header edge. Press Escape to finish.`, 'info');
          }
        }
      }
    ];

    const menu = buildMenu(actions);
    menu.hidden = true;
    menu.classList.add('hidden');
    if (options.source === 'touch') {
      menu.classList.add('tcm--touch');
    }
    positionMenu(menu, mouseX, mouseY, { source: options.source });
    menuEl = menu;
    VisibilityUtils.show([menu], {
      ariaHidden: false,
      raisedUiKey: 'table-context-menu'
    });
    requestAnimationFrame(() => menu.classList.add('tcm--visible'));
    attachDismissListeners(menu);
    return true;
  }

  function markTouchContextActivity() {
    lastTouchContextActivityUntil = Date.now() + TOUCH_CONTEXT_ACTIVITY_MS;
  }

  function isRecentTouchContextActivity() {
    return Date.now() <= lastTouchContextActivityUntil;
  }

  function onContextMenu(e) {
    const contextTarget = getContextTarget(e.target);
    if (!contextTarget) return;
    e.preventDefault();
    const source = e.pointerType === 'touch'
      || e.pointerType === 'pen'
      || e.sourceCapabilities?.firesTouchEvents
      || isRecentTouchContextActivity()
      ? 'touch'
      : 'mouse';
    if (source === 'touch' && Date.now() <= suppressTouchContextMenuUntil) {
      return;
    }
    if (source === 'touch' && contextTarget.headerCell && touchContextState?.openOnRelease) {
      return;
    }
    openContextMenuForTarget(e.target, e.clientX, e.clientY, { source });
  }

  function clearTouchContextState() {
    if (touchContextState?.timerId) {
      window.clearTimeout(touchContextState.timerId);
    }
    touchContextState = null;
  }

  function cancelTouchContextForMovement() {
    const hadOpenedMenu = Boolean(touchContextState?.opened || menuEl);
    suppressTouchContextMenuUntil = Date.now() + TOUCH_CONTEXT_SUPPRESSION_MS;
    if (hadOpenedMenu) {
      dismiss();
      clearTableTextSelection();
      suppressTableClickUntil = Date.now() + TOUCH_CONTEXT_SUPPRESSION_MS;
    }
    clearTouchContextState();
  }

  function getTouchContextProfile(contextTarget) {
    const isHeaderTarget = Boolean(contextTarget?.headerCell && !contextTarget?.bodyCell);
    return {
      delay: isHeaderTarget ? TOUCH_CONTEXT_HEADER_DELAY : TOUCH_CONTEXT_CELL_DELAY,
      moveTolerance: isHeaderTarget ? TOUCH_CONTEXT_HEADER_MOVE_TOLERANCE : TOUCH_CONTEXT_CELL_MOVE_TOLERANCE,
      openOnRelease: isHeaderTarget
    };
  }

  function startTouchContext({ clientX, clientY, contextTarget, pointerId, target }) {
    clearTouchContextState();
    markTouchContextActivity();
    const profile = getTouchContextProfile(contextTarget);
    touchContextState = {
      armedForRelease: false,
      moveTolerance: profile.moveTolerance,
      opened: false,
      openOnRelease: profile.openOnRelease,
      pointerId,
      startX: clientX,
      startY: clientY,
      target,
      timerId: window.setTimeout(() => {
        if (!touchContextState || touchContextState.pointerId !== pointerId) {
          return;
        }

        if (touchContextState.openOnRelease) {
          touchContextState.armedForRelease = true;
          navigator.vibrate?.(8);
          return;
        }

        const opened = openContextMenuForTarget(
          touchContextState.target,
          touchContextState.startX,
          touchContextState.startY,
          { source: 'touch' }
        );
        touchContextState.opened = opened;
        if (opened) {
          suppressTableClickUntil = Date.now() + 900;
          navigator.vibrate?.(8);
        }
      }, profile.delay)
    };
  }

  function updateTouchContextMove(pointerId, clientX, clientY) {
    if (!touchContextState || touchContextState.pointerId !== pointerId) {
      return;
    }

    markTouchContextActivity();
    const deltaX = clientX - touchContextState.startX;
    const deltaY = clientY - touchContextState.startY;
    const moveTolerance = touchContextState.moveTolerance || TOUCH_CONTEXT_CELL_MOVE_TOLERANCE;
    if (Math.hypot(deltaX, deltaY) > moveTolerance) {
      cancelTouchContextForMovement();
    }
  }

  function finishTouchContext(pointerId) {
    if (!touchContextState || touchContextState.pointerId !== pointerId) {
      return false;
    }
    let opened = touchContextState.opened;
    if (!opened && touchContextState.openOnRelease && touchContextState.armedForRelease) {
      opened = openContextMenuForTarget(
        touchContextState.target,
        touchContextState.startX,
        touchContextState.startY,
        { source: 'touch' }
      );
    }
    clearTouchContextState();
    if (opened) {
      suppressTableClickUntil = Date.now() + 900;
    }
    return opened;
  }

  function onPointerDown(e) {
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (!isTouch || isTableContextInteractiveTarget(e.target)) {
      return;
    }

    const contextTarget = getContextTarget(e.target);
    if (!contextTarget) {
      return;
    }

    startTouchContext({
      clientX: e.clientX,
      clientY: e.clientY,
      contextTarget,
      pointerId: `pointer:${e.pointerId}`,
      target: contextTarget.targetCell
    });
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      markTouchContextActivity();
    }
    updateTouchContextMove(`pointer:${e.pointerId}`, e.clientX, e.clientY);
  }

  function onPointerEnd(e) {
    if (finishTouchContext(`pointer:${e.pointerId}`)) {
      e.preventDefault();
    }
  }

  function getChangedTouch(e) {
    const touches = Array.from(e.changedTouches || []);
    if (!touchContextState?.pointerId?.startsWith?.('touch:')) {
      return touches[0] || null;
    }

    return touches.find(touch => `touch:${touch.identifier ?? 0}` === touchContextState.pointerId) || null;
  }

  function onTouchStart(e) {
    markTouchContextActivity();
    if ((e.touches?.length || 0) !== 1 || isTableContextInteractiveTarget(e.target)) {
      clearTouchContextState();
      return;
    }

    const touch = getChangedTouch(e);
    const target = touch?.target || e.target;
    const contextTarget = getContextTarget(target);
    if (!touch || !contextTarget) {
      return;
    }

    startTouchContext({
      clientX: touch.clientX,
      clientY: touch.clientY,
      contextTarget,
      pointerId: `touch:${touch.identifier ?? 0}`,
      target: contextTarget.targetCell
    });
  }

  function onTouchMove(e) {
    markTouchContextActivity();
    const touch = getChangedTouch(e);
    if (!touch) {
      return;
    }

    updateTouchContextMove(`touch:${touch.identifier ?? 0}`, touch.clientX, touch.clientY);
  }

  function onTouchEnd(e) {
    markTouchContextActivity();
    const touch = getChangedTouch(e);
    if (!touch) {
      return;
    }

    if (finishTouchContext(`touch:${touch.identifier ?? 0}`)) {
      e.preventDefault();
    }
  }

  function onTableDragStartCapture(e) {
    const contextTarget = getContextTarget(e.target);
    if (!contextTarget?.headerCell || !isRecentTouchContextActivity()) {
      return;
    }

    cancelTouchContextForMovement();
  }

  function onTableClickCapture(e) {
    if (Date.now() > suppressTableClickUntil || !e.target.closest?.('#example-table')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
  }

  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerup', onPointerEnd);
  document.addEventListener('pointercancel', onPointerEnd);
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: false });
  document.addEventListener('touchcancel', onTouchEnd, { passive: false });
  document.addEventListener('dragstart', onTableDragStartCapture, true);
  document.addEventListener('click', onTableClickCapture, true);

  return { dismiss };
})();
