import { escapeRegExp, formatDuration } from './dataFormatters.js';
import { formatStandardFilterTooltipHTML } from './tooltipFormatters.js';
import { fieldDefsArray, registerDynamicField, resolveFieldName } from '../filters/fieldDefs.js';

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
        fieldDefsArray: fieldDefsArray,
        normalizeUiConfigFilters,
        registerDynamicField: registerDynamicField,
        resolveFieldName: resolveFieldName
      };
    }
  };
}

export {
  createQueryHistoryDependencies
};
