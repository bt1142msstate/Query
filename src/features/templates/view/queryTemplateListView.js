import { escapeHtml } from '../../../core/formatting/html.js';
import { formatTimestamp } from '../data/queryTemplateModels.js';
import { getTemplateListSections } from './queryTemplateViewState.js';

export function renderTemplateList({
  elements,
  state,
  visibleTemplates,
  restricted,
  onSelectTemplate,
  onPinTemplate,
  onReorderPinnedTemplates,
  onDraggedPinnedIdChange,
  getTemplateSvgMarkup = () => ''
}) {
  if (!elements.list || !elements.listStatus) {
    return;
  }

  const sections = getTemplateListSections(visibleTemplates);
  const pinnedTemplates = sections.find(section => section.key === 'pinned')?.items || [];
  if (state.loading) {
    elements.listStatus.textContent = 'Loading templates…';
    elements.listStatus.classList.remove('hidden');
    elements.list.replaceChildren();
    elements.emptyState?.classList.add('hidden');
    return;
  }

  if (!visibleTemplates.length) {
    elements.listStatus.classList.add('hidden');
    elements.list.replaceChildren();
    elements.emptyState?.classList.remove('hidden');
    return;
  }

  elements.emptyState?.classList.add('hidden');
  elements.listStatus.classList.add('hidden');

  const createTemplateRow = (template, options = {}) => {
    const row = document.createElement('div');
    row.className = 'templates-list-row';
    row.classList.toggle('is-pinned', Boolean(template.pinned));
    row.classList.toggle('is-draggable', Boolean(options.draggable));
    row.dataset.templateId = template.id;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'templates-list-item';
    button.classList.toggle('is-selected', template.id === state.selectedId);
    button.dataset.templateId = template.id;
    const descriptionTooltip = String(template.description || '').trim() || 'No description provided.';
    button.setAttribute('data-tooltip', descriptionTooltip);
    button.setAttribute('aria-label', `${template.name}. ${descriptionTooltip}`);
    const descriptionClass = String(template.description || '').trim()
      ? 'templates-list-item__description'
      : 'templates-list-item__description templates-list-item__description--empty';
    const timestamp = formatTimestamp(template.updatedAt || template.createdAt);
    const categories = Array.isArray(template.categories) ? template.categories : [];
    const categorySummary = categories.length
      ? categories.slice(0, 2).map(category => category.name).filter(Boolean).join(', ')
      : '';
    const overflowCategoryCount = Math.max(0, categories.length - 2);
    const metaParts = [
      timestamp ? `Updated ${timestamp}` : '',
      categorySummary ? `In ${categorySummary}${overflowCategoryCount ? ` +${overflowCategoryCount}` : ''}` : ''
    ].filter(Boolean);
    const metaText = metaParts.length ? metaParts.join(' • ') : 'Reusable query setup';
    const templateSvgMarkup = getTemplateSvgMarkup(template);
    button.innerHTML = `
      <span class="templates-list-item__brick-face" aria-hidden="true">
        <span class="templates-list-item__stud-row"><span></span><span></span><span></span><span></span></span>
        <span class="templates-list-item__svg">${templateSvgMarkup}</span>
      </span>
      <span class="templates-list-item__copy">
        <span class="templates-list-item__title-row">
          <span class="templates-list-item__title">${escapeHtml(template.name)}</span>
          ${template.pinned ? '<span class="templates-list-item__pin-badge">Pinned</span>' : ''}
        </span>
        <span class="${descriptionClass}">${escapeHtml(descriptionTooltip)}</span>
        <span class="templates-list-item__meta">${escapeHtml(metaText)}</span>
      </span>
      <span class="templates-list-item__snap" aria-hidden="true"></span>`;
    button.addEventListener('click', () => onSelectTemplate(template.id));
    row.appendChild(button);

    const actions = document.createElement('span');
    actions.className = 'templates-list-actions';

    if (!restricted) {
      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.className = 'templates-list-pin-btn';
      pinBtn.innerHTML = `
        <svg class="templates-list-pin-btn__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 17v5" />
          <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.23V17h14v-1.77a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.76V5l1-2H8l1 2z" />
        </svg>
        <span class="templates-list-pin-btn__label">${template.pinned ? 'Unpin' : 'Pin'}</span>`;
      pinBtn.setAttribute('aria-label', `${template.pinned ? 'Unpin' : 'Pin'} ${template.name}`);
      pinBtn.addEventListener('click', event => {
        event.stopPropagation();
        onPinTemplate(template);
      });
      actions.appendChild(pinBtn);
    }

    const detailsBtn = document.createElement('button');
    detailsBtn.type = 'button';
    detailsBtn.className = 'templates-list-more-btn';
    detailsBtn.innerHTML = '<span aria-hidden="true">...</span><span class="sr-only">Open template details</span>';
    detailsBtn.setAttribute('aria-label', `Open details for ${template.name}`);
    detailsBtn.addEventListener('click', event => {
      event.stopPropagation();
      onSelectTemplate(template.id);
    });
    actions.appendChild(detailsBtn);
    row.appendChild(actions);

    if (options.draggable && !restricted) {
      bindPinnedTemplateDrag({
        row,
        template,
        elements,
        state,
        pinnedTemplates,
        onReorderPinnedTemplates,
        onDraggedPinnedIdChange
      });
    }

    return row;
  };

  const fragment = document.createDocumentFragment();
  const buildSection = (title, items, options = {}) => {
    if (!items.length) return;
    const section = document.createElement('section');
    section.className = `templates-list-section templates-list-section--${options.key || 'default'}`;
    const header = document.createElement('div');
    header.className = 'templates-list-section__header';
    header.innerHTML = `<h4 class="templates-list-section__title">${escapeHtml(title)} <span>(${items.length})</span></h4><span class="templates-list-section__count" aria-hidden="true"></span>`;
    section.appendChild(header);
    const body = document.createElement('div');
    body.className = 'templates-list-section__body';
    items.forEach(template => body.appendChild(createTemplateRow(template, options)));
    section.appendChild(body);
    fragment.appendChild(section);
  };

  sections.forEach(section => {
    buildSection(section.title, section.items, { draggable: section.draggable, key: section.key });
  });
  elements.list.replaceChildren(fragment);
}

function bindPinnedTemplateDrag({
  row,
  template,
  elements,
  state,
  pinnedTemplates,
  onReorderPinnedTemplates,
  onDraggedPinnedIdChange
}) {
  row.draggable = true;
  row.addEventListener('dragstart', event => {
    onDraggedPinnedIdChange(template.id);
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', template.id);
  });
  row.addEventListener('dragend', () => {
    onDraggedPinnedIdChange('');
    row.classList.remove('is-dragging');
    elements.list.querySelectorAll('.templates-list-row').forEach(item => item.classList.remove('is-drop-target'));
  });
  row.addEventListener('dragover', event => {
    event.preventDefault();
    if (state.draggedPinnedId && state.draggedPinnedId !== template.id) {
      row.classList.add('is-drop-target');
    }
  });
  row.addEventListener('dragleave', () => {
    row.classList.remove('is-drop-target');
  });
  row.addEventListener('drop', event => {
    event.preventDefault();
    row.classList.remove('is-drop-target');
    const draggedId = state.draggedPinnedId || event.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === template.id) {
      return;
    }
    const nextPinnedIds = pinnedTemplates.map(item => item.id);
    const fromIndex = nextPinnedIds.indexOf(draggedId);
    const toIndex = nextPinnedIds.indexOf(template.id);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    nextPinnedIds.splice(toIndex, 0, nextPinnedIds.splice(fromIndex, 1)[0]);
    onReorderPinnedTemplates(nextPinnedIds);
  });
}
