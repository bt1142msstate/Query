export function createDragDropHeaderActions({
  document,
  window,
  icons,
  services,
  getLifecycleState,
  calculateHeaderActionLayout,
  getHoverHeader
}) {
  const headerActions = document.createElement('div');
  headerActions.className = 'th-actions';

  const copyButton = createHeaderActionButton({
    document,
    className: 'th-action th-copy',
    label: 'Copy column values',
    tooltip: 'Copy column values',
    html: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H10V7h9v14z"/>
      </svg>
    `
  });

  const sortButton = createHeaderActionButton({
    document,
    className: 'th-action th-sort',
    label: 'Sort column',
    tooltip: 'Sort ascending',
    html: `
      <svg viewBox="0 0 24 24" aria-hidden="true" class="th-sort-icon">
        <path fill="currentColor" d="M8 5l-4 4h3v10h2V9h3L8 5zm8 14l4-4h-3V5h-2v10h-3l4 4z"/>
      </svg>
    `
  });

  const trashButton = createHeaderActionButton({
    document,
    className: 'th-action th-trash',
    label: 'Remove column',
    tooltip: 'Remove column',
    html: icons.trashSVG()
  });

  headerActions.appendChild(sortButton);
  headerActions.appendChild(copyButton);
  headerActions.appendChild(trashButton);

  function syncSortState(th = getHoverHeader()) {
    const state = services.getVirtualTableState();
    const sortField = String(state?.currentSortColumn || '');
    const sortDirection = String(state?.currentSortDirection || 'asc');
    const fieldName = th?.getAttribute('data-sort-field') || '';
    const isSortable = Boolean(fieldName);
    const isActive = isSortable && fieldName === sortField;

    sortButton.disabled = !isSortable || Boolean(getLifecycleState().queryRunning);
    sortButton.classList.toggle('is-active', isActive);
    sortButton.classList.toggle('is-desc', isActive && sortDirection === 'desc');
    sortButton.setAttribute('aria-label', !isSortable ? 'Sorting unavailable for this column' : (isActive ? `Sorted ${sortDirection === 'asc' ? 'ascending' : 'descending'}. Click to reverse.` : 'Sort column'));
    sortButton.setAttribute('data-tooltip', !isSortable ? 'Sorting unavailable' : (isActive ? `Sorted ${sortDirection === 'asc' ? 'ascending' : 'descending'} - click to reverse` : 'Sort ascending'));
  }

  function clearLayoutState(th) {
    if (!th) {
      return;
    }

    th.classList.remove('th-actions-below');
    th.style.removeProperty('--th-balance-space');
  }

  function updateLayout(th) {
    if (!th) {
      return;
    }

    const headerContent = th.querySelector('.th-header-content');
    const labelText = th.querySelector('.th-text');
    const sortIcon = th.querySelector('.sort-icon');
    if (!headerContent || !labelText) {
      clearLayoutState(th);
      return;
    }

    const actionsVisible = headerActions.parentNode === th;
    const sortWidth = sortIcon ? Math.ceil(sortIcon.getBoundingClientRect().width) : 0;
    const actionsWidth = actionsVisible ? Math.ceil(headerActions.getBoundingClientRect().width) : 0;
    const labelWidth = Math.ceil(labelText.scrollWidth);
    const layout = calculateHeaderActionLayout({
      containerWidth: th.clientWidth,
      labelWidth,
      sortWidth,
      actionsWidth,
      actionsVisible
    });

    th.classList.toggle('th-actions-below', layout.stackActions);
    th.style.setProperty('--th-balance-space', `${layout.balanceSpace}px`);
  }

  function attachToHeader(th) {
    th.appendChild(headerActions);
    syncSortState(th);
    window.requestAnimationFrame(() => updateLayout(th));
  }

  function detachFromHeader(th) {
    clearLayoutState(th);
    if (headerActions.parentNode) {
      headerActions.parentNode.removeChild(headerActions);
    }
  }

  return {
    root: headerActions,
    copyButton,
    sortButton,
    trashButton,
    attachToHeader,
    clearLayoutState,
    detachFromHeader,
    syncSortState,
    updateLayout
  };
}

function createHeaderActionButton({
  document,
  className,
  label,
  tooltip,
  html
}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.setAttribute('data-tooltip', tooltip);
  button.innerHTML = html;
  return button;
}
