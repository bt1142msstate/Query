import { sanitizeSvgMarkup } from './queryTemplateModels.js';
import { getAssignedCategoriesForPayload } from './queryTemplateState.js';

function getTemplatePinOrder(template) {
  return Number.isFinite(template?.pinOrder) ? template.pinOrder : undefined;
}

function buildTemplateMutationPayload(template, categories = [], uiConfig = null) {
  return {
    name: template?.name || '',
    description: template?.description || '',
    svg: sanitizeSvgMarkup(template?.svg),
    categories: getAssignedCategoriesForPayload(template, categories),
    ui_config: uiConfig,
    pinned: Boolean(template?.pinned),
    pin_order: getTemplatePinOrder(template)
  };
}

function buildCreateTemplatePayload({ draft, categories = [], uiConfig } = {}) {
  return buildTemplateMutationPayload(draft, categories, uiConfig);
}

function buildUpdateTemplatePayload({ draft, categories = [], currentQueryConfig = null, fallbackUiConfig = null } = {}) {
  return buildTemplateMutationPayload(draft, categories, currentQueryConfig || fallbackUiConfig);
}

function buildPinTemplatePayload({ template, nextPinned = false, nextPinOrder } = {}) {
  return {
    name: template?.name || '',
    description: template?.description || '',
    svg: sanitizeSvgMarkup(template?.svg),
    categories: Array.isArray(template?.categories) ? template.categories : [],
    ui_config: template?.uiConfig || null,
    pinned: Boolean(nextPinned),
    pin_order: nextPinned ? nextPinOrder : undefined
  };
}

export {
  buildCreateTemplatePayload,
  buildPinTemplatePayload,
  buildTemplateMutationPayload,
  buildUpdateTemplatePayload,
  getTemplatePinOrder
};
