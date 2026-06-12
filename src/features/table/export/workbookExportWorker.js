import { createWorkbookBlob } from './workbookExport.js';

function queueWorkerTask(resolve) {
  if (typeof scheduler !== 'undefined' && typeof scheduler.postTask === 'function') {
    Promise.resolve(scheduler.postTask(resolve, { priority: 'user-visible' })).catch(() => setTimeout(resolve, 0));
    return;
  }

  if (typeof MessageChannel === 'function') {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close?.();
      channel.port2.close?.();
      resolve();
    };
    channel.port2.postMessage(undefined);
    return;
  }

  setTimeout(resolve, 0);
}

function yieldToWorker() {
  return new Promise(queueWorkerTask);
}

self.onmessage = async event => {
  const { config, id, state } = event.data || {};
  try {
    const { blob, filename } = await createWorkbookBlob({
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
      error: error?.message || 'Workbook export worker failed',
      id,
      type: 'error'
    });
  }
};
