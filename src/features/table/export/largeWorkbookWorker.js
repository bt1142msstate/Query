import { createLargeWorkbookBlob } from './largeWorkbookExport.js';

function yieldToWorker() {
  return new Promise(resolve => {
    if (typeof scheduler !== 'undefined' && typeof scheduler.postTask === 'function') {
      Promise.resolve(scheduler.postTask(resolve, { priority: 'user-visible' })).catch(() => setTimeout(resolve, 0));
      return;
    }
    setTimeout(resolve, 0);
  });
}

self.onmessage = async event => {
  const { config, id, state } = event.data || {};
  try {
    const { blob, filename } = await createLargeWorkbookBlob({
      config,
      state,
      helpers: {
        progress: {
          update(payload) {
            self.postMessage({ id, payload, type: 'progress' });
          }
        },
        yieldToBrowser: yieldToWorker
      }
    });
    self.postMessage({ blob, filename, id, type: 'complete' });
  } catch (error) {
    self.postMessage({
      error: error?.message || 'Large workbook worker failed',
      id,
      type: 'error'
    });
  }
};
