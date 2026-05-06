import { escapeRegExp, formatDuration } from './dataFormatters.js';
import { formatStandardFilterTooltipHTML } from './tooltipFormatters.js';

function createQueryHistoryDependencies(normalizeUiConfigFilters) {
  return {
    display() {
      return {
        formatDuration,
        formatStandardFilterTooltipHTML,
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
