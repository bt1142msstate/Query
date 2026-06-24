import { VisibilityUtils } from '../../../core/visibility.js';
import { buildHistoryDetailsOverlayHtml } from './queryHistoryDetails.js';

function closeHistoryDetailsOverlayView(document) {
  const shell = document.querySelector('.history-details-modal-shell');
  if (shell) {
    VisibilityUtils.hide([shell], {
      ariaHidden: true,
      raisedUiKey: 'history-details-overlay'
    });
  }
  shell?.remove();
  document.body.classList.remove('history-details-open');
}

function renderHistoryDetailsOverlayView({
  dependencies,
  document,
  onClose,
  query
}) {
  const shell = document.createElement('div');
  shell.className = 'history-details-modal-shell';
  shell.hidden = true;
  shell.classList.add('hidden');
  shell.innerHTML = buildHistoryDetailsOverlayHtml(query, dependencies);
  document.body.appendChild(shell);
  VisibilityUtils.show([shell], {
    ariaHidden: false,
    raisedUiKey: 'history-details-overlay'
  });
  document.body.classList.add('history-details-open');

  shell.querySelectorAll('[data-history-details-close]').forEach(node => {
    node.addEventListener('click', event => {
      event.preventDefault();
      onClose?.();
    });
  });
}

export {
  closeHistoryDetailsOverlayView,
  renderHistoryDetailsOverlayView
};
