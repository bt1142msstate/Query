import { BackendApi } from '../../../core/backendApi.js';
import { getClientErrorMessage } from '../../../core/clientErrorMessages.js';

function createIconButton(className, label, svg) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.setAttribute('data-tooltip', label);
  button.innerHTML = svg;
  return button;
}

function createHistoryRunActions({ getQueryById, updateHistoryQuery, showToastMessage }) {
  async function updateRun(queryId, changes) {
    const { data } = await BackendApi.postJson({ action: 'update_history_run', query_id: queryId, ...changes });
    return updateHistoryQuery(queryId, {
      ...(Object.hasOwn(changes, 'name') ? { name: data.name || changes.name } : {}),
      ...(Object.hasOwn(changes, 'pinned') ? { pinned: Boolean(data.pinned) } : {})
    });
  }

  function beginRename(button) {
    const queryId = button.dataset.queryId;
    const query = getQueryById(queryId);
    const header = button.closest('.history-name-header');
    const name = header?.querySelector('.history-query-name');
    if (!query || !header || !name || header.querySelector('.history-rename-form')) return;

    name.hidden = true;
    const form = document.createElement('form');
    form.className = 'history-rename-form';
    const input = document.createElement('input');
    input.className = 'history-rename-input';
    input.value = query.name || query.id;
    input.maxLength = 200;
    input.required = true;
    input.setAttribute('aria-label', 'Run name');
    const save = createIconButton('history-rename-save', 'Save run name', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>');
    save.type = 'submit';
    const cancel = createIconButton('history-rename-cancel', 'Cancel rename', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>');
    form.append(input, save, cancel);
    header.insertBefore(form, header.querySelector('.history-run-controls'));

    const close = () => {
      form.remove();
      name.hidden = false;
      button.focus();
    };
    cancel.addEventListener('click', event => {
      event.stopPropagation();
      close();
    });
    form.addEventListener('click', event => event.stopPropagation());
    form.addEventListener('submit', async event => {
      event.preventDefault();
      event.stopPropagation();
      const nextName = input.value.trim();
      if (!nextName || nextName === query.name) {
        close();
        return;
      }
      input.disabled = true;
      save.disabled = true;
      try {
        await updateRun(queryId, { name: nextName });
        showToastMessage('Run renamed.', 'success');
      } catch (error) {
        input.disabled = false;
        save.disabled = false;
        showToastMessage(getClientErrorMessage(error, { fallback: 'The run could not be renamed. Try again.' }), 'error');
        input.focus();
      }
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    });
    input.focus();
    input.select();
  }

  function bind(scope) {
    scope.querySelectorAll('.history-rename-btn').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        beginRename(button);
      });
    });
    scope.querySelectorAll('.history-pin-btn').forEach(button => {
      button.addEventListener('click', async event => {
        event.stopPropagation();
        const queryId = button.dataset.queryId;
        const query = getQueryById(queryId);
        if (!query || button.disabled) return;
        button.disabled = true;
        try {
          const pinned = !query.pinned;
          await updateRun(queryId, { pinned });
          showToastMessage(pinned ? 'Run pinned.' : 'Run unpinned.', 'success');
        } catch (error) {
          button.disabled = false;
          showToastMessage(getClientErrorMessage(error, { fallback: 'The pin could not be updated. Try again.' }), 'error');
        }
      });
    });
  }

  return { bind };
}

export { createHistoryRunActions };
