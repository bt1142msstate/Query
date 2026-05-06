function createQueryHistoryDependencies(normalizeUiConfigFilters) {
  return {
    display() {
      return {
        formatDuration: window.formatDuration,
        formatStandardFilterTooltipHTML: window.formatStandardFilterTooltipHTML,
        normalizeUiConfigFilters
      };
    },
    mapper() {
      return {
        escapeRegExp: window.escapeRegExp,
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
