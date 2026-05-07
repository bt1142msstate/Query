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
import { SharedFieldPicker } from '../ui/fieldPicker.js';

(() => {
  let menuEl = null;
  let dismissHandlers = [];
  let clearPreview = null;
  const services = appServices;

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

  function positionMenu(menu, mouseX, mouseY) {
    // Append off-screen first so we can measure its natural size
    menu.style.left = '-9999px';
    menu.style.top  = '-9999px';
    document.body.appendChild(menu);

    const { width, height } = menu.getBoundingClientRect();
    const PAD = 8;
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;

    let left = mouseX;
    let top  = mouseY;
    if (left + width  > vw - PAD) left = vw - width  - PAD;
    if (top  + height > vh - PAD) top  = vh - height - PAD;
    if (left < PAD) left = PAD;
    if (top  < PAD) top  = PAD;

    menu.style.left = `${left}px`;
    menu.style.top  = `${top}px`;
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
    const onDown   = ev => { if (!menu.contains(ev.target)) dismiss(); };
    const onKey    = ev => { if (ev.key === 'Escape') { ev.preventDefault(); dismiss(); } };
    const onScroll = () => dismiss();

    // Defer so the right-click event itself doesn't immediately close the menu
    setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
      window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    }, 0);

    dismissHandlers = [
      () => document.removeEventListener('mousedown', onDown),
      () => document.removeEventListener('keydown', onKey),
      () => window.removeEventListener('scroll', onScroll, { capture: true }),
    ];
  }

  // ── Entry point ───────────────────────────────────────────────────────────────

  function onContextMenu(e) {
    const headerCell = e.target.closest('#example-table thead th[data-col-index]');
    const bodyCell = e.target.closest('#example-table tbody td[data-col-index]');
    const targetCell = bodyCell || headerCell;
    if (!targetCell) return;
    e.preventDefault();

    dismiss();

    const tr       = bodyCell?.closest('tr') || null;
    const colIndex = parseInt(targetCell.dataset.colIndex, 10);
    const rowIndex = parseInt(tr?.dataset?.rowIndex ?? 'NaN', 10);

    if (isNaN(colIndex)) return;

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
    positionMenu(menu, e.clientX, e.clientY);
    menuEl = menu;
    VisibilityUtils.show([menu], {
      ariaHidden: false,
      raisedUiKey: 'table-context-menu'
    });
    requestAnimationFrame(() => menu.classList.add('tcm--visible'));
    attachDismissListeners(menu);
  }

  document.addEventListener('contextmenu', onContextMenu);

  return { dismiss };
})();
