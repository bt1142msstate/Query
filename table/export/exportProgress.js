/**
 * Excel export progress UI helpers.
 * Keeps long workbook exports visibly active while heavy ExcelJS work runs.
 */
const EXPORT_PROGRESS_ID = 'export-progress';

function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ensureProgressElement() {
  let progress = document.getElementById(EXPORT_PROGRESS_ID);
  if (progress) {
    return progress;
  }

  const dialog = document.querySelector('#export-overlay .export-dialog');
  const footer = dialog?.querySelector('.export-dialog__footer');
  if (!dialog || !footer) {
    return null;
  }

  progress = document.createElement('section');
  progress.id = EXPORT_PROGRESS_ID;
  progress.className = 'export-progress hidden';
  progress.setAttribute('aria-live', 'polite');
  progress.setAttribute('role', 'status');
  progress.innerHTML = `
    <div class="export-progress__copy">
      <span class="export-progress__eyebrow">Export progress</span>
      <strong id="export-progress-title">Preparing workbook</strong>
      <span id="export-progress-detail">Starting export...</span>
    </div>
    <div class="export-progress__meter" aria-hidden="true">
      <span id="export-progress-percent">0%</span>
      <div class="export-progress__track">
        <span id="export-progress-bar"></span>
      </div>
    </div>
  `;
  dialog.insertBefore(progress, footer);
  return progress;
}

function update({ title, detail, percent, indeterminate = false } = {}) {
  const progress = ensureProgressElement();
  if (!progress) {
    return;
  }

  progress.classList.remove('hidden');
  progress.classList.toggle('export-progress--indeterminate', indeterminate);

  const safePercent = clampPercent(percent);
  const titleElement = progress.querySelector('#export-progress-title');
  const detailElement = progress.querySelector('#export-progress-detail');
  const percentElement = progress.querySelector('#export-progress-percent');
  const barElement = progress.querySelector('#export-progress-bar');

  if (titleElement && title) {
    titleElement.textContent = title;
  }
  if (detailElement && detail) {
    detailElement.textContent = detail;
  }
  if (percentElement) {
    percentElement.textContent = indeterminate ? 'Working' : `${safePercent}%`;
  }
  if (barElement) {
    barElement.style.width = indeterminate ? '42%' : `${safePercent}%`;
  }
}

function hide() {
  const progress = document.getElementById(EXPORT_PROGRESS_ID);
  if (!progress) {
    return;
  }

  progress.classList.add('hidden');
  progress.classList.remove('export-progress--indeterminate');
}

function setBusy(elements, busy) {
  elements.overlay?.classList.toggle('export-overlay--busy', busy);
  elements.overlay?.setAttribute('aria-busy', busy ? 'true' : 'false');

  [
    elements.closeBtn,
    elements.cancelBtn,
    elements.singleMode,
    elements.groupedMode,
    elements.groupField,
    elements.includeMasterSheet,
    elements.includeOverviewSheet,
    elements.includeRunDetailsSheet
  ].forEach(element => {
    if (element) {
      element.disabled = busy;
    }
  });
}

function queueTaskYield(resolve) {
  const scheduler = typeof window !== 'undefined' ? window.scheduler : null;
  if (scheduler && typeof scheduler.postTask === 'function') {
    Promise.resolve(scheduler.postTask(resolve, { priority: 'user-visible' }))
      .catch(() => setTimeout(resolve, 0));
    return;
  }

  const Channel = typeof MessageChannel === 'function'
    ? MessageChannel
    : (typeof window !== 'undefined' ? window.MessageChannel : null);
  if (typeof Channel === 'function') {
    const channel = new Channel();
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

function shouldYieldWithAnimationFrame() {
  // Background tabs heavily throttle animation frames; use task yields there so exports keep advancing.
  return typeof window !== 'undefined'
    && typeof window.requestAnimationFrame === 'function'
    && !(typeof document !== 'undefined' && document.hidden);
}

function yieldToBrowser() {
  return new Promise(resolve => {
    if (shouldYieldWithAnimationFrame()) {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    queueTaskYield(resolve);
  });
}

const ExcelExportProgress = Object.freeze({
  hide,
  setBusy,
  update
});

export { ExcelExportProgress, yieldToBrowser };
