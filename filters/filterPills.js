import { Icons } from '../core/utils.js';
import {
  buildFilterValueLabel,
  getFilterDisplayValues,
  openFilterListViewer,
  shouldUseFilterListViewer
} from './filterValueUi.js';

export function createFilterPillElement(filter, fieldDef, onRemove) {
  const pill = document.createElement('span');
  pill.className = 'cond-pill';
  pill.style.display = 'flex';
  pill.style.alignItems = 'center';
  pill.style.justifyContent = 'space-between';

  const operatorLabel = filter.cond.charAt(0).toUpperCase() + filter.cond.slice(1);
  const content = buildFilterPillContent(filter, fieldDef, operatorLabel);
  const trashSVG = `<button type="button" class="filter-trash" aria-label="Remove filter" tabindex="0" style="background:none;border:none;padding:0;margin-left:0.7em;display:flex;align-items:center;cursor:pointer;color:#888;">${Icons.trashSVG(20, 20)}</button>`;
  pill.innerHTML = `<span>${content}</span>${trashSVG}`;

  if (shouldUseFilterListViewer(filter, fieldDef)) {
    pill.classList.add('cond-pill-clickable');
    pill.setAttribute('role', 'button');
    pill.setAttribute('tabindex', '0');
    pill.setAttribute('aria-label', `View ${fieldDef?.name || 'filter'} values`);
    pill.removeAttribute('data-tooltip-html');
    pill.removeAttribute('data-tooltip');
    pill.addEventListener('click', event => {
      if (event.target.closest('.filter-trash')) return;
      openFilterListViewer(filter, fieldDef, { fieldName: fieldDef?.name, operatorLabel });
    });
    pill.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openFilterListViewer(filter, fieldDef, { fieldName: fieldDef?.name, operatorLabel });
      }
    });
  } else {
    pill.classList.remove('cond-pill-clickable');
    pill.removeAttribute('role');
    pill.removeAttribute('data-tooltip-html');
  }

  pill.querySelector('.filter-trash').addEventListener('click', event => {
    event.stopPropagation();
    if (typeof onRemove === 'function') {
      onRemove();
    }
  });

  return pill;
}

function buildFilterPillContent(filter, fieldDef, operatorLabel) {
  if (filter.cond.toLowerCase() === 'between') {
    const parts = getFilterDisplayValues(filter, fieldDef);
    const lo = parts[0] || '';
    const hi = parts[1] || '';
    return `Between <b>${lo}</b> and <b>${hi}</b>`;
  }

  return `${operatorLabel} <b>${buildFilterValueLabel(filter, fieldDef)}</b>`;
}

export function createPostFilterPillElement(summary, onOpenPostFilters) {
  if (!summary?.hasPostFilters) {
    return null;
  }

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'cond-pill cond-pill-post-filter cond-pill-clickable';
  pill.setAttribute('aria-label', 'Open post filters');
  pill.setAttribute('data-tooltip', 'Edit active post filters');

  const fieldLabel = summary.fieldCount === 1 ? 'field' : 'fields';
  const ruleLabel = summary.ruleCount === 1 ? 'rule' : 'rules';
  pill.innerHTML = `Post Filters <b>${summary.ruleCount} ${ruleLabel}</b> across <b>${summary.fieldCount} ${fieldLabel}</b>`;

  pill.addEventListener('click', () => {
    onOpenPostFilters();
  });

  pill.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenPostFilters();
    }
  });

  return pill;
}
