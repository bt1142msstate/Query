import { createWorkbookBlob, exportWorkbook } from '../../lib/workbook-export/workbookExport.js';

function mergeExportOptions(baseValue, overrideValue) {
  return {
    ...(baseValue || {}),
    ...(overrideValue || {})
  };
}

function createWorkbookExportComponent(defaults = {}) {
  const defaultConfig = defaults.config || {};
  const defaultHelpers = defaults.helpers || {};

  function resolveOptions(options = {}) {
    return {
      config: mergeExportOptions(defaultConfig, options.config),
      helpers: mergeExportOptions(defaultHelpers, options.helpers),
      state: options.state
    };
  }

  return Object.freeze({
    createBlob(options = {}) {
      return createWorkbookBlob(resolveOptions(options));
    },
    download(options = {}) {
      return exportWorkbook(resolveOptions(options));
    }
  });
}

export { createWorkbookExportComponent };
