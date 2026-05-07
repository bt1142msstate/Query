import { escapeRegExp, formatDuration } from './dataFormatters.js';
import { formatStandardFilterTooltipHTML } from './tooltipFormatters.js';
import { appRuntime } from './appRuntime.js';

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
        fieldDefsArray: appRuntime.fieldDefsArray,
        normalizeUiConfigFilters,
        registerDynamicField: appRuntime.registerDynamicField,
        resolveFieldName: appRuntime.resolveFieldName
      };
    }
  };
}

export {
  createQueryHistoryDependencies
};
