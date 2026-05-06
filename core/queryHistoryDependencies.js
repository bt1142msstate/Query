import { escapeRegExp, formatDuration } from './dataFormatters.js';

function createQueryHistoryDependencies(normalizeUiConfigFilters) {
  return {
    display() {
      return {
        formatDuration,
        formatStandardFilterTooltipHTML: window.TooltipManager?.formatStandardFilterTooltipHTML,
        normalizeUiConfigFilters
      };
    },
    mapper() {
      return {
        escapeRegExp,
        fieldDefsArray: window.fieldDefsArray,
        normalizeUiConfigFilters,
        registerDynamicField: window.registerDynamicField,
        resolveFieldName: window.resolveFieldName
      };
    }
  };
}

export {
  createQueryHistoryDependencies
};
