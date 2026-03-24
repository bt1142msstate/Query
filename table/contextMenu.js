/**
 * Table Context Menu
 * Right-click menu on table body cells.
 * Options: Copy Cell, Copy Row (tab-separated), Copy Column (newline-separated).
 */
window.TableContextMenu = (() => {
  let menuEl = null;
  let dismissHandlers = [];
  const services = window.AppServices;

  // ── Data helpers ────────────────────────────────────────────────────────────

  function getVT() {
    return services.getVirtualTableData();
  }

  function getFields() {
    return window.QueryStateReaders?.getDisplayedFields?.() || [];
  }

  function formatCellValue(raw, field) {
    return window.FormatUtils.formatCellDisplay(raw, field);
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

  function getRawCellValue(rowIndex, colIndex) {
    const vt = getVT();
    const fields = getFields();
    if (!vt || !fields.length) return '';
    const field = fields[colIndex];
    if (!field) return '';
    const dataColIdx = vt.columnMap.get(field);
    if (dataColIdx === undefined) return '';
    return vt.rows[rowIndex]?.[dataColIdx];
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
      btn.addEventListener('click', () => { action.run(); dismiss(); });
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
    if (menuEl) {
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
    const td = e.target.closest('#example-table tbody td');
    if (!td) return;
    e.preventDefault();

    dismiss();

    const tr       = td.closest('tr');
    const colIndex = parseInt(td.dataset.colIndex, 10);
    const rowIndex = parseInt(tr?.dataset?.rowIndex ?? 'NaN', 10);

    if (isNaN(colIndex)) return;

    const fields   = getFields();
    const field    = fields[colIndex];
    const colLabel = field
      ? (field.length > 24 ? field.slice(0, 22) + '\u2026' : field)
      : `Column ${colIndex + 1}`;

    const hasRow = !isNaN(rowIndex);
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
        run() {
          if (!field) return;
          services.sortTableBy(field);
        }
      },
      {
        icon:  FILTER_ICON,
        label: 'Post Filter This Value',
        hint:  colLabel,
        run() {
          if (!field || !hasRow || !window.PostFilterSystem || typeof window.PostFilterSystem.addEqualsFilterFromCell !== 'function') {
            return;
          }

          window.PostFilterSystem.addEqualsFilterFromCell(field, getRawCellValue(rowIndex, colIndex));
        }
      },
      {
        icon:  CELL_ICON,
        label: 'Copy Cell',
        hint:  '',
        run() {
          const val = hasRow
            ? getCellValue(rowIndex, colIndex)
            : getCellFallbackText(td);
          window.ClipboardUtils.copy(val, { successMessage: 'Cell copied' });
        }
      },
      {
        icon:  ROW_ICON,
        label: 'Copy Row',
        hint:  'tab-separated',
        run() {
          if (!hasRow) return;
          const vals = getRowValues(rowIndex);
          window.ClipboardUtils.copy(vals.join('\t'), {
            successMessage: `Row copied \u2014 ${vals.length} value${vals.length !== 1 ? 's' : ''}`
          });
        }
      },
      {
        icon:  COL_ICON,
        label: 'Copy Column',
        hint:  colLabel,
        run() {
          const vals = getColumnValues(colIndex);
          if (!vals.length) return;
          window.ClipboardUtils.copy(vals.join('\n'), {
            successMessage: `Column copied \u2014 ${vals.length} row${vals.length !== 1 ? 's' : ''}`
          });
        }
      }
    ];

    const menu = buildMenu(actions);
    positionMenu(menu, e.clientX, e.clientY);
    menuEl = menu;
    requestAnimationFrame(() => menu.classList.add('tcm--visible'));
    attachDismissListeners(menu);
  }

  document.addEventListener('contextmenu', onContextMenu);

  return { dismiss };
})();
