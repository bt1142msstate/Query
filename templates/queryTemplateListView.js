import { escapeHtml } from '../core/formatting/html.js';
import { getTemplateListSections } from './queryTemplateViewState.js';

export function renderTemplateList({
  elements,
  state,
  visibleTemplates,
  restricted,
  onSelectTemplate,
  onPinTemplate,
  onReorderPinnedTemplates,
  onDraggedPinnedIdChange
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
    button.innerHTML = `
      <div class="templates-list-item__title-row">
        ${template.pinned ? '<span class="templates-list-item__pin-badge">Pinned</span>' : ''}
        <div class="templates-list-item__title">${escapeHtml(template.name)}</div>
      </div>`;
    button.addEventListener('click', () => onSelectTemplate(template.id));
    row.appendChild(button);

    if (!restricted) {
      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.className = 'templates-list-pin-btn';
      pinBtn.textContent = template.pinned ? 'Unpin' : 'Pin';
      pinBtn.setAttribute('aria-label', `${template.pinned ? 'Unpin' : 'Pin'} ${template.name}`);
      pinBtn.addEventListener('click', event => {
        event.stopPropagation();
        onPinTemplate(template);
      });
      row.appendChild(pinBtn);
    }

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
    section.className = 'templates-list-section';
    const header = document.createElement('div');
    header.className = 'templates-list-section__header';
    header.innerHTML = `<h4 class="templates-list-section__title">${escapeHtml(title)}</h4><span class="templates-list-section__count">${items.length}</span>`;
    section.appendChild(header);
    const body = document.createElement('div');
    body.className = 'templates-list-section__body';
    items.forEach(template => body.appendChild(createTemplateRow(template, options)));
    section.appendChild(body);
    fragment.appendChild(section);
  };

  sections.forEach(section => {
    buildSection(section.title, section.items, { draggable: section.draggable });
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
