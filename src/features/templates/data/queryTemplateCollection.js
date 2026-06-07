import { sortTemplatesInDisplayOrder } from './queryTemplateState.js';

function getTemplateCollection(templates = []) {
  return Array.isArray(templates) ? templates : [];
}

function sortTemplateCollection(templates = []) {
  return sortTemplatesInDisplayOrder(getTemplateCollection(templates).slice());
}

function appendTemplateToCollection(templates, template) {
  return sortTemplateCollection([...getTemplateCollection(templates), template]);
}

function replaceTemplateInCollection(templates, templateId, nextTemplate, options = {}) {
  const replacedTemplates = getTemplateCollection(templates).map(template =>
    template.id === templateId ? nextTemplate : template
  );
  const nextTemplates = options.renumberPinned
    ? renumberPinnedTemplateOrder(replacedTemplates)
    : replacedTemplates;

  return sortTemplateCollection(nextTemplates);
}

function removeTemplateFromCollection(templates, templateId) {
  return getTemplateCollection(templates).filter(template => template.id !== templateId);
}

function getPinnedTemplateCountExcluding(templates, excludedTemplateId) {
  return getTemplateCollection(templates)
    .filter(template => template.pinned && template.id !== excludedTemplateId)
    .length;
}

function getPinnedSortValue(template) {
  return template.pinOrder ?? Number.MAX_SAFE_INTEGER;
}

function renumberPinnedTemplateOrder(templates) {
  const nextTemplates = getTemplateCollection(templates).map(template => ({ ...template }));
  nextTemplates
    .filter(template => template.pinned)
    .sort((left, right) => getPinnedSortValue(left) - getPinnedSortValue(right))
    .forEach((template, orderIndex) => {
      template.pinOrder = orderIndex;
    });

  return nextTemplates;
}

function applyPinnedTemplateOrder(templates, orderedIds = []) {
  const orderIndexById = new Map(
    (Array.isArray(orderedIds) ? orderedIds : [])
      .map((id, index) => [String(id || '').trim(), index])
      .filter(([id]) => Boolean(id))
  );
  const nextTemplates = getTemplateCollection(templates).map(template => ({ ...template }));

  nextTemplates
    .filter(template => template.pinned)
    .sort((left, right) => {
      const leftIndex = orderIndexById.has(left.id) ? orderIndexById.get(left.id) : Number.MAX_SAFE_INTEGER;
      const rightIndex = orderIndexById.has(right.id) ? orderIndexById.get(right.id) : Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    })
    .forEach((template, index) => {
      template.pinOrder = index;
    });

  return sortTemplateCollection(nextTemplates);
}

export {
  appendTemplateToCollection,
  applyPinnedTemplateOrder,
  getPinnedTemplateCountExcluding,
  removeTemplateFromCollection,
  renumberPinnedTemplateOrder,
  replaceTemplateInCollection,
  sortTemplateCollection
};
