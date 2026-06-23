import {
  createWorkbookBlob,
  getWorkbookCellCount,
  getWorkbookHelpers,
  shouldUseWorkbookWorker
} from './workbookBuilder.js';
import { downloadWorkbookBlob } from './workbookDownload.js';

let workbookWorkerSequence = 0;

function canUseWorkbookWorker() {
  return typeof Worker === 'function' && typeof URL === 'function';
}

function getWorkerGroupingCandidates(state, config = {}) {
  const candidates = Array.isArray(state?.groupingCandidates) ? state.groupingCandidates : [];
  if (config.mode !== 'grouped') {
    return [];
  }
  const selectedCandidate = candidates.find(candidate => candidate.field === config.groupField);
  return selectedCandidate ? [selectedCandidate] : candidates;
}

function getWorkerSourceData(sourceData = {}) {
  return {
    dataRows: sourceData.dataRows,
    displayedFields: sourceData.displayedFields,
    fieldTypeMap: sourceData.fieldTypeMap,
    virtualData: {
      columnMap: sourceData.virtualData?.columnMap
    }
  };
}

function createWorkerExportState(state, config = {}) {
  return {
    groupingCandidates: getWorkerGroupingCandidates(state, config),
    rowCount: state.rowCount,
    sourceData: getWorkerSourceData(state.sourceData),
    tableName: state.tableName
  };
}

function exportWorkbookInWorker({ state, config, helpers }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workbookExportWorker.js', import.meta.url), { type: 'module' });
    const id = `workbook-export-${Date.now()}-${workbookWorkerSequence += 1}`;
    let settled = false;
    function finish(callback, value) {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback(value);
    }

    worker.onmessage = event => {
      const message = event.data || {};
      if (message.id !== id) return;
      if (message.type === 'progress') {
        helpers.progress.update(message.payload || {});
        return;
      }
      if (message.type === 'complete') {
        downloadWorkbookBlob(message.blob, message.filename);
        finish(resolve, message.filename);
        return;
      }
      if (message.type === 'error') {
        finish(reject, new Error(message.error || 'Workbook export worker failed'));
      }
    };
    worker.onerror = event => {
      finish(reject, new Error(event.message || 'Workbook export worker failed'));
    };
    worker.onmessageerror = () => {
      finish(reject, new Error('Workbook export worker message failed'));
    };
    helpers.progress.update({
      title: 'Building workbook',
      detail: 'Preparing workbook in a background worker',
      percent: 4
    });
    try {
      worker.postMessage({ config, id, state: createWorkerExportState(state, config) });
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function exportWorkbook({ state, config, helpers }) {
  const resolvedHelpers = getWorkbookHelpers(helpers);
  if (shouldUseWorkbookWorker(state, config) && canUseWorkbookWorker()) {
    try {
      return await exportWorkbookInWorker({ config, helpers: resolvedHelpers, state });
    } catch (error) {
      console.warn('Workbook export worker failed; falling back to page export.', error);
    }
  }

  const { blob, filename } = await createWorkbookBlob({ config, helpers: resolvedHelpers, state });
  downloadWorkbookBlob(blob, filename);
  return filename;
}

export {
  createWorkbookBlob,
  exportWorkbook,
  getWorkbookCellCount,
  shouldUseWorkbookWorker
};
