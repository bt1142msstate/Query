import { notifyBackgroundTaskComplete, prepareBackgroundTaskNotification } from '../../core/backgroundTaskNotifications.js';

function prepareHistoryResultLoadNotification() {
  return prepareBackgroundTaskNotification();
}

function notifyHistoryResultLoadComplete({ permissionPromise, query, queryId, rowCount, streamError }) {
  const running = Boolean(query?.running);
  const message = streamError
    ? `Connection ended early. Loaded ${rowCount} partial result${rowCount !== 1 ? 's' : ''}.`
    : (running
        ? `Loaded ${rowCount} partial result${rowCount !== 1 ? 's' : ''} from running query.`
        : `Loaded ${rowCount} result${rowCount !== 1 ? 's' : ''}.`);
  notifyBackgroundTaskComplete({
    body: message,
    permissionPromise,
    tag: queryId ? `history-results-${queryId}` : 'history-results',
    title: streamError ? 'History results interrupted' : 'History results loaded'
  }).catch(() => {});
}

export { notifyHistoryResultLoadComplete, prepareHistoryResultLoadNotification };
