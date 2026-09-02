import { BackendApi } from '../core/backendApi.js';
import { getSession } from '../core/authSession.js';
import { ClipboardUtils } from '../core/clipboard.js';
import { getClientErrorMessage } from '../core/clientErrorMessages.js';
import { showToastMessage } from './toast.js';
import {
  buildCreateRecord,
  buildPresetValues,
  buildUserSearchPayload,
  buildUserUpdateTarget,
  editableRawValue,
  formatUserCredentials,
  generateUserPin,
  hasLibraryUserAdminAccess,
  isEditableUserField
} from './libraryUserAdminModel.js';

const button = document.getElementById('toggle-library-user-admin');
let dialog;
let state = { rows: [], record: null, loading: false, complete: false, receipt: null };
let presets = [];
let pendingPin = '';

function showError(error, fallback) {
  showToastMessage(getClientErrorMessage(error, { fallback }), 'error');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '<span class="user-admin-blank">Blank</span>';
  if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
  return escapeHtml(value);
}

function target() {
  return state.record?.user ? {
    user_key: String(state.record.user.user_key || ''),
    user_id: String(state.record.user.user_id || '')
  } : null;
}

async function request(payload, options = {}) {
  const { data } = await BackendApi.postJson(payload, {
    timeoutMs: options.timeoutMs || 120000,
    headers: options.headers || {}
  });
  return data;
}

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'library-user-admin-dialog';
  dialog.className = 'library-user-admin-dialog';
  dialog.innerHTML = `
    <div class="user-admin-app">
      <header class="user-admin-header">
        <div>
          <div class="user-admin-eyebrow">Restricted workspace</div>
          <h2>User administration</h2>
          <p>Find, review, create, update, and safely remove Symphony users.</p>
        </div>
        <div class="user-admin-header-actions">
          <span class="user-admin-access-badge">Brandon &amp; Anita</span>
          <button type="button" class="user-admin-icon-button" data-user-admin-close aria-label="Close user administration">×</button>
        </div>
      </header>
      <div class="user-admin-layout">
        <aside class="user-admin-sidebar">
          <div class="user-admin-sidebar-heading">
            <div><strong>Users</strong><span id="user-admin-result-count">Search by exact ID or scoped name.</span></div>
            <button type="button" class="user-admin-primary compact" data-user-admin-new>+ New user</button>
          </div>
          <form id="user-admin-search-form" class="user-admin-search-form">
            <label>Search by<select name="search_mode">
              <option value="user_id">User ID</option>
              <option value="name">Name</option>
              <option value="alternative_id">Alternate ID</option>
              <option value="group_id">Group ID</option>
            </select></label>
            <label class="user-admin-library-scope hidden">Library code<input name="library" autocomplete="off" placeholder="Example: FRL-TUN"></label>
            <label class="user-admin-query-label">Search<input name="query" autocomplete="off" required placeholder="Enter an exact user ID"></label>
            <button type="submit" class="user-admin-primary">Search</button>
          </form>
          <div id="user-admin-results" class="user-admin-results" aria-live="polite"></div>
        </aside>
        <main id="user-admin-main" class="user-admin-main" tabindex="-1"></main>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  bindDialogEvents();
  renderMain();
  return dialog;
}

function renderResults() {
  const container = dialog?.querySelector('#user-admin-results');
  const count = dialog?.querySelector('#user-admin-result-count');
  if (!container || !count) return;
  count.textContent = state.rows.length ? `${state.rows.length} result${state.rows.length === 1 ? '' : 's'}` : 'No users loaded.';
  container.innerHTML = state.rows.length ? state.rows.map(row => `
    <button type="button" class="user-admin-result ${state.record?.user?.user_key === row.user_key ? 'selected' : ''}"
            data-user-key="${escapeHtml(row.user_key)}" data-user-id="${escapeHtml(row.user_id)}">
      <strong>${escapeHtml(row.name || row.user_id)}</strong>
      <span>${escapeHtml(row.user_id)}</span>
      <small>${escapeHtml([row.library, row.profile].filter(Boolean).join(' · '))}</small>
    </button>`).join('') : '<div class="user-admin-sidebar-empty">Search results will appear here.</div>';
}

function renderReceipt() {
  const receipt = state.receipt;
  if (!receipt) return '';
  let action = '';
  if (receipt.action === 'delete' && receipt.rollback_available) {
    action = `<button type="button" class="user-admin-secondary" data-user-admin-restore="${escapeHtml(receipt.operation_id)}">Restore deleted user</button>`;
  } else if ((receipt.action === 'create' || receipt.action === 'create_from_template') && receipt.rollback_available) {
    action = `<button type="button" class="user-admin-secondary" data-user-admin-rollback-create="${escapeHtml(receipt.operation_id)}">Undo creation</button>`;
  } else if (receipt.action && receipt.rollback_available) {
    action = `<button type="button" class="user-admin-secondary" data-user-admin-rollback-update="${escapeHtml(receipt.operation_id)}">Undo last edit</button>`;
  }
  const credentials = receipt.credentials ? `<div class="user-admin-credentials">
    <span>One-time sign-in details</span><code>${escapeHtml(receipt.credentials.username)} · ${escapeHtml(receipt.credentials.pin)}</code>
    <button type="button" class="user-admin-secondary" data-user-admin-copy-credentials>Copy username &amp; PIN</button>
    <button type="button" class="user-admin-icon-button" data-user-admin-dismiss-credentials aria-label="Dismiss one-time credentials">×</button>
  </div>` : '';
  return `<div class="user-admin-receipt" role="status"><div><strong>Verified change</strong><span>${escapeHtml(receipt.state || 'Complete')} · Operation ${escapeHtml(receipt.operation_id || '')}</span></div>${action}</div>${credentials}`;
}

function renderEmpty() {
  return `${renderReceipt()}<div class="user-admin-empty">
    <div class="user-admin-empty-icon" aria-hidden="true">👤</div>
    <h3>Choose a user to see the complete record</h3>
    <p>Search by ID, or search a name within one library. Details are grouped by their Sirsi source, with sensitive values available only inside this protected workspace.</p>
    <div class="user-admin-safety-grid">
      <div><strong>Exact identity</strong><span>Every write is locked to the user ID and immutable key.</span></div>
      <div><strong>Protected backup</strong><span>A complete verified backup is captured before every change.</span></div>
      <div><strong>Verified result</strong><span>Sirsi is read again after each write; unsafe deletes stop automatically.</span></div>
    </div>
  </div>`;
}

function renderRelated(group) {
  return `<div class="user-admin-related-grid">${(group.fields || []).map(field => {
    const domain = String(field.id || '').replace(/^related\./, '');
    return `<button type="button" class="user-admin-related" data-user-admin-related="${escapeHtml(domain)}">
      <span>${escapeHtml(field.label)}</span><strong data-related-count="${escapeHtml(domain)}">Check</strong>
    </button>`;
  }).join('')}</div>`;
}

function renderField(field) {
  const editable = isEditableUserField(field);
  const badges = [field.source, field.sensitive ? 'Sensitive' : '', field.occurrence > 1 ? `Occurrence ${field.occurrence}` : ''].filter(Boolean);
  return `<div class="user-admin-field ${field.visibility !== 'visible' ? 'redacted' : ''}">
    <div class="user-admin-field-label"><span>${escapeHtml(field.label)}</span><small>${badges.map(escapeHtml).join(' · ')}</small></div>
    <div class="user-admin-field-value">${field.visibility === 'visible' ? displayValue(field.value) : '<span class="user-admin-redacted">Protected value</span>'}</div>
    ${editable ? `<button type="button" class="user-admin-edit" data-user-admin-edit="${escapeHtml(field.id)}">Edit</button>` : ''}
  </div>`;
}

function renderRecord() {
  const record = state.record;
  const user = record.user || {};
  return `${renderReceipt()}
    <section class="user-admin-record-header">
      <div><div class="user-admin-eyebrow">Symphony user</div><h3>${escapeHtml(user.name || user.user_id)}</h3>
      <p><span>${escapeHtml(user.user_id)}</span><span>Key ${escapeHtml(user.user_key)}</span><span>${escapeHtml(user.library || '')}</span><span>${escapeHtml(user.profile || '')}</span></p></div>
      <div class="user-admin-record-actions">
        <button type="button" class="user-admin-secondary" data-user-admin-reload>Refresh</button>
        <button type="button" class="user-admin-secondary" data-user-admin-complete ${state.complete ? 'disabled' : ''}>${state.complete ? 'Complete account loaded' : 'Load complete account'}</button>
        <button type="button" class="user-admin-danger" data-user-admin-delete>Remove user</button>
      </div>
    </section>
    <div class="user-admin-record-tools"><label>Filter record fields<input type="search" data-user-admin-field-search placeholder="Search labels or values"></label>
      <span>${record.coverage?.field_instance_count || record.fields?.length || 0} field instances · ${record.coverage?.source_count || 0} sources checked</span></div>
    <div class="user-admin-groups">${(record.groups || []).map((group, index) => `
      <details class="user-admin-group" ${index < 2 ? 'open' : ''} data-user-admin-group>
        <summary><span><strong>${escapeHtml(group.label)}</strong><small>${escapeHtml(group.source || '')}</small></span><b>${group.fields?.length || 0}</b></summary>
        <div class="user-admin-group-body">${group.id === 'related' ? renderRelated(group) : (group.fields || []).map(renderField).join('') || '<p class="user-admin-group-empty">No records in this section.</p>'}</div>
      </details>`).join('')}</div>
    <section class="user-admin-security-note"><strong>Credential-safe by design</strong><p>PINs, passwords, tokens, and authentication secrets are never returned by this screen. Only safe status metadata is shown.</p></section>`;
}

function renderLoading(message = 'Loading user record…') {
  return `<div class="user-admin-loading"><span class="user-admin-spinner" aria-hidden="true"></span><strong>${escapeHtml(message)}</strong><p>Sirsi is checking the authoritative record.</p></div>`;
}

function renderMain() {
  const main = dialog?.querySelector('#user-admin-main');
  if (!main) return;
  main.innerHTML = state.loading ? renderLoading() : state.record ? renderRecord() : renderEmpty();
  renderResults();
}

async function loadUser(userKey, userId, complete = false) {
  state.loading = true;
  state.complete = complete;
  renderMain();
  try {
    state.record = await request({
      action: 'library_user_view', target: { user_key: String(userKey), user_id: String(userId) },
      include_complete_account: complete
    });
  } catch (error) {
    state.record = null;
    showError(error, 'The user record could not be loaded.');
  } finally {
    state.loading = false;
    renderMain();
  }
}

function createFormMarkup() {
  const categoryInputs = Array.from({ length: 10 }, (_, index) => `<label>Category ${index + 1}<input name="category${index + 1}" autocomplete="off"></label>`).join('');
  return `<form id="user-admin-create-form" class="user-admin-editor-form">
    <div class="user-admin-form-heading"><div><div class="user-admin-eyebrow">New Symphony user</div><h3>Create user</h3><p>Apply a role preset, choose a PIN method, then create and verify the record.</p></div><button type="button" class="user-admin-icon-button" data-user-admin-cancel-form aria-label="Cancel">×</button></div>
    <section class="user-admin-preset-bar">
      <label>Creation preset<select name="preset_id"><option value="">No preset</option>${presets.map(preset => `<option value="${escapeHtml(preset.preset_id)}">${escapeHtml(preset.name)}</option>`).join('')}</select></label>
      <button type="button" class="user-admin-secondary" data-user-admin-apply-preset>Apply</button>
      <button type="button" class="user-admin-secondary" data-user-admin-edit-preset>Edit</button>
      <button type="button" class="user-admin-secondary" data-user-admin-save-preset>Save current as preset</button>
      <button type="button" class="user-admin-danger" data-user-admin-delete-preset>Delete</button>
    </section>
    <section class="user-admin-preset-editor hidden" data-user-admin-preset-editor>
      <input type="hidden" name="editing_preset_id"><label>Preset name<input name="preset_name" maxlength="80"></label>
      <label>Description<input name="preset_description" maxlength="240"></label>
      <div class="user-admin-form-actions"><button type="button" class="user-admin-secondary" data-user-admin-cancel-preset>Cancel</button><button type="button" class="user-admin-primary" data-user-admin-confirm-save-preset>Save preset</button></div>
    </section>
    <section class="user-admin-preset-editor hidden" data-user-admin-preset-delete>
      <p>Type <strong data-user-admin-preset-delete-name></strong> to remove this preset.</p>
      <label>Confirmation<input name="preset_delete_confirmation" autocomplete="off"></label>
      <div class="user-admin-form-actions"><button type="button" class="user-admin-secondary" data-user-admin-cancel-preset-delete>Cancel</button><button type="button" class="user-admin-danger" data-user-admin-confirm-delete-preset>Remove preset</button></div>
    </section>
    <fieldset><legend>Identity</legend><div class="user-admin-form-grid">
      <label>User ID <b>Required</b><input name="user_id" required autocomplete="off"></label>
      <label>First name<input name="first_name" autocomplete="off"></label><label>Middle name<input name="middle_name" autocomplete="off"></label>
      <label>Last name<input name="last_name" autocomplete="off"></label><label>Suffix<input name="suffix" autocomplete="off"></label>
      <label>Preferred name<input name="preferred_name" autocomplete="off"></label><label>Display name<input name="display_name" autocomplete="off"></label>
    </div>
      <div class="user-admin-pin-builder">
        <label>PIN method<select name="pin_strategy"><option value="name_random">First initial + last name + 4 digits</option><option value="memorable">Memorable words + 4 digits</option><option value="random">14 random characters</option><option value="library_default">Library default PIN</option></select></label>
        <label>Generated PIN<input name="pin_preview" readonly aria-describedby="user-admin-pin-note"></label>
        <button type="button" class="user-admin-secondary" data-user-admin-regenerate-pin>Regenerate</button>
        <small id="user-admin-pin-note">Generated locally and sent through a one-time protected channel. It is never saved in presets or operation logs.</small>
      </div>
    </fieldset>
    <fieldset><legend>Library access</legend><div class="user-admin-form-grid">
      <label>Library code <b>Required</b><input name="library" required autocomplete="off" placeholder="FRL-TUN"></label>
      <label>Profile <b>Required</b><input name="profile" required autocomplete="off" placeholder="FADULT-RES"></label>
      <label>Expiration <b>Required</b><input name="expiration_date" required value="NEVER" autocomplete="off" placeholder="NEVER or YYYY-MM-DD"></label>
      <label>Title<input name="title" autocomplete="off"></label><label>Department<input name="department" maxlength="10" autocomplete="off"><small>Up to 10 characters</small></label>
    </div></fieldset>
    <fieldset><legend>Primary contact</legend><div class="user-admin-form-grid">
      <label class="span-2">Street<input name="street" autocomplete="street-address"></label><label>City / state<input name="city_state" autocomplete="address-level2"></label>
      <label>ZIP<input name="zip" autocomplete="postal-code"></label><label>Email<input name="email" type="email" autocomplete="email"></label><label>Phone<input name="phone" autocomplete="tel"></label>
    </div></fieldset>
    <details class="user-admin-advanced"><summary>Advanced identity and policy fields</summary><div class="user-admin-form-grid">
      <label>Alternate ID<input name="alternative_id" autocomplete="off"></label><label>Group ID<input name="group_id" autocomplete="off"></label>
      <label>Web authentication ID<input name="web_auth_id" autocomplete="off"></label><label>Preferred language<input name="preferred_language" autocomplete="off"></label>
      <label>User access<input name="user_access" autocomplete="off"></label><label>Environment<input name="environment" autocomplete="off"></label>
      <label>Charge history rule<input name="charge_history_rule" autocomplete="off"></label><label>Name display preference<input name="name_display_preference" autocomplete="off"></label>
      <label>Routing flag<input name="routing_flag" autocomplete="off"></label>${categoryInputs}
    </div></details>
    <div class="user-admin-form-actions"><button type="button" class="user-admin-secondary" data-user-admin-cancel-form>Cancel</button><button type="submit" class="user-admin-primary">Create and verify user</button></div>
  </form>`;
}

function openCreateForm() {
  state.record = null;
  const main = dialog.querySelector('#user-admin-main');
  main.innerHTML = createFormMarkup();
  updatePinPreview();
  main.querySelector('[name="user_id"]')?.focus();
  loadPresets();
}

function createForm() {
  return dialog?.querySelector('#user-admin-create-form') || null;
}

function updatePinPreview(force = false) {
  const form = createForm();
  if (!form) return;
  const strategy = form.elements.pin_strategy.value;
  if (force || strategy === 'name_random' || !pendingPin) {
    pendingPin = generateUserPin(strategy, form.elements.first_name.value, form.elements.last_name.value);
  }
  form.elements.pin_preview.value = strategy === 'library_default' ? 'Assigned by the library' : pendingPin;
}

function renderPresetOptions(selected = '') {
  const select = createForm()?.elements.preset_id;
  if (!select) return;
  select.innerHTML = `<option value="">No preset</option>${presets.map(preset => `<option value="${escapeHtml(preset.preset_id)}">${escapeHtml(preset.name)}</option>`).join('')}`;
  select.value = selected;
}

async function loadPresets() {
  try {
    const result = await request({ action: 'library_user_preset_list' });
    presets = result.presets || [];
    renderPresetOptions();
  } catch (error) {
    showError(error, 'Creation presets could not be loaded.');
  }
}

function selectedPreset() {
  const id = createForm()?.elements.preset_id?.value;
  return presets.find(preset => preset.preset_id === id) || null;
}

function applySelectedPreset() {
  const form = createForm();
  const preset = selectedPreset();
  if (!form || !preset) {
    showToastMessage('Choose a creation preset first.', 'info');
    return;
  }
  for (const [name, value] of Object.entries(preset.values || {})) {
    if (form.elements[name]) form.elements[name].value = value;
  }
  showToastMessage(`${preset.name} was applied.`, 'success');
}

function openPresetEditor(editExisting = false) {
  const form = createForm();
  const panel = form?.querySelector('[data-user-admin-preset-editor]');
  if (!form || !panel) return;
  const preset = editExisting ? selectedPreset() : null;
  if (editExisting && !preset) {
    showToastMessage('Choose a preset to edit.', 'info');
    return;
  }
  form.querySelector('[data-user-admin-preset-delete]')?.classList.add('hidden');
  panel.classList.remove('hidden');
  form.elements.editing_preset_id.value = preset?.preset_id || '';
  form.elements.preset_name.value = preset?.name || '';
  form.elements.preset_description.value = preset?.description || '';
  if (preset) applySelectedPreset();
  form.elements.preset_name.focus();
}

async function savePreset() {
  const form = createForm();
  if (!form) return;
  const values = buildPresetValues(new FormData(form));
  const name = form.elements.preset_name.value.trim();
  if (!name) {
    form.elements.preset_name.focus();
    showToastMessage('Enter a preset name.', 'error');
    return;
  }
  if (!Object.keys(values).length) {
    showToastMessage('Set at least one library or policy field before saving a preset.', 'error');
    return;
  }
  try {
    const result = await request({
      action: 'library_user_preset_save',
      preset_id: form.elements.editing_preset_id.value || undefined,
      name,
      description: form.elements.preset_description.value.trim(),
      values
    });
    const saved = result.preset;
    presets = [...presets.filter(preset => preset.preset_id !== saved.preset_id), saved];
    presets.sort((a, b) => a.name.localeCompare(b.name));
    renderPresetOptions(saved.preset_id);
    form.querySelector('[data-user-admin-preset-editor]')?.classList.add('hidden');
    showToastMessage('Creation preset saved.', 'success');
  } catch (error) {
    showError(error, 'The creation preset could not be saved.');
  }
}

function openPresetDelete() {
  const form = createForm();
  const preset = selectedPreset();
  if (!form || !preset) {
    showToastMessage('Choose a preset to delete.', 'info');
    return;
  }
  form.querySelector('[data-user-admin-preset-editor]')?.classList.add('hidden');
  const panel = form.querySelector('[data-user-admin-preset-delete]');
  panel.classList.remove('hidden');
  panel.querySelector('[data-user-admin-preset-delete-name]').textContent = `DELETE ${preset.name}`;
  form.elements.preset_delete_confirmation.value = '';
  form.elements.preset_delete_confirmation.focus();
}

async function deletePreset() {
  const form = createForm();
  const preset = selectedPreset();
  if (!form || !preset) return;
  try {
    await request({
      action: 'library_user_preset_delete', preset_id: preset.preset_id,
      confirmation: form.elements.preset_delete_confirmation.value.trim()
    });
    presets = presets.filter(item => item.preset_id !== preset.preset_id);
    renderPresetOptions();
    form.querySelector('[data-user-admin-preset-delete]')?.classList.add('hidden');
    showToastMessage('Creation preset removed.', 'success');
  } catch (error) {
    showError(error, 'The creation preset could not be removed.');
  }
}

function editFormMarkup(field) {
  const raw = editableRawValue(field);
  const structured = field.container !== 'Core User Record' && Array.isArray(field.subfields) && field.subfields.length;
  const inputs = structured
    ? field.subfields.map((part, index) => `<label>Subfield ${escapeHtml(part.code)}<input name="subfield_${index}" value="${escapeHtml(part.value)}" data-subfield-code="${escapeHtml(part.code)}"></label>`).join('')
    : `<label>New value<textarea name="new_value" rows="3">${escapeHtml(raw)}</textarea></label>`;
  return `<form id="user-admin-edit-form" class="user-admin-inline-editor" data-field-id="${escapeHtml(field.id)}">
    <div><div class="user-admin-eyebrow">Edit verified field</div><h4>${escapeHtml(field.label)}</h4><p>Current value: ${displayValue(field.value)}</p></div>
    <div class="user-admin-edit-inputs">${inputs}</div>
    <div class="user-admin-form-actions"><button type="button" class="user-admin-secondary" data-user-admin-cancel-edit>Cancel</button><button type="submit" class="user-admin-primary">Save and verify</button></div>
  </form>`;
}

function openEditForm(fieldId) {
  const field = state.record?.fields?.find(item => item.id === fieldId);
  if (!field || !isEditableUserField(field)) return;
  const main = dialog.querySelector('#user-admin-main');
  const existing = main.querySelector('.user-admin-inline-editor');
  existing?.remove();
  main.querySelector('.user-admin-record-header')?.insertAdjacentHTML('afterend', editFormMarkup(field));
  main.querySelector('.user-admin-inline-editor input, .user-admin-inline-editor textarea')?.focus();
}

function deleteConfirmationMarkup() {
  const user = state.record.user;
  return `<form id="user-admin-delete-form" class="user-admin-confirm-card">
    <div class="user-admin-danger-icon">!</div><div><div class="user-admin-eyebrow">Permanent removal</div><h4>Remove ${escapeHtml(user.name || user.user_id)}?</h4>
    <p>Removal will stop if the account has checkouts, bills, holds, group links, or other dependencies. A complete protected backup is captured first.</p>
    <label>Type <strong>DELETE ${escapeHtml(user.user_id)}</strong><input name="confirmation" autocomplete="off" required></label>
    <label class="user-admin-checkbox"><input type="checkbox" name="acknowledge" required><span>I understand that restoring this logical account may assign a different internal key.</span></label>
    <div class="user-admin-form-actions"><button type="button" class="user-admin-secondary" data-user-admin-cancel-delete>Cancel</button><button type="submit" class="user-admin-danger">Remove user</button></div></div>
  </form>`;
}

function openDeleteConfirmation() {
  const main = dialog.querySelector('#user-admin-main');
  main.querySelector('.user-admin-confirm-card')?.remove();
  main.querySelector('.user-admin-record-header')?.insertAdjacentHTML('afterend', deleteConfirmationMarkup());
  main.querySelector('#user-admin-delete-form [name="confirmation"]')?.focus();
}

async function handleSearch(form) {
  const data = new FormData(form);
  const payload = buildUserSearchPayload({
    searchMode: data.get('search_mode'), query: data.get('query'), library: data.get('library')
  });
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const result = await request(payload);
    state.rows = result.rows || [];
    state.record = null;
    state.receipt = null;
    renderMain();
    if (state.rows.length === 1) await loadUser(state.rows[0].user_key, state.rows[0].user_id);
    else if (!state.rows.length) showToastMessage('No matching users were found.', 'info');
  } catch (error) {
    showError(error, 'The user search could not be completed.');
  } finally {
    submit.disabled = false;
  }
}

async function handleCreate(form) {
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const strategy = form.elements.pin_strategy.value;
    const generatedPin = strategy === 'library_default' ? '' : pendingPin;
    const record = buildCreateRecord(new FormData(form));
    const result = await request({
      action: 'library_user_create', record,
      pin_action: strategy === 'library_default' ? 'set_default' : 'set_from_ephemeral_input'
    }, {
      timeoutMs: 180000,
      headers: generatedPin ? { 'X-Library-User-Secret': generatedPin } : {}
    });
    state.receipt = {
      ...result,
      ...(generatedPin ? { credentials: { username: record.user_id, pin: generatedPin } } : {})
    };
    pendingPin = '';
    state.rows = [{ user_key: result.user_key, user_id: result.user_id, name: result.user_id }];
    showToastMessage('The user was created and verified.', 'success');
    await loadUser(result.user_key, result.user_id);
  } catch (error) {
    showError(error, 'The user could not be created.');
  } finally { submit.disabled = false; }
}

async function handleEdit(form) {
  const field = state.record.fields.find(item => item.id === form.dataset.fieldId);
  if (!field) return;
  const structuredInputs = [...form.querySelectorAll('[data-subfield-code]')];
  const newValue = structuredInputs.length
    ? structuredInputs.map(input => `|${input.dataset.subfieldCode}${input.value}`).join('')
    : String(new FormData(form).get('new_value') ?? '');
  const expected = editableRawValue(field);
  let editAction = 'replace_exact';
  if (/^UserCategory(?:10|[1-9])$/.test(field.editor_field || '')) editAction = newValue ? 'set_valid_policy' : 'clear_policy';
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    state.receipt = await request({
      action: 'library_user_update', target: buildUserUpdateTarget(state.record.user, field),
      edit_action: editAction, expected_value: expected, new_value: newValue
    }, { timeoutMs: 180000 });
    showToastMessage('The field was updated and verified.', 'success');
    await loadUser(state.record.user.user_key, state.record.user.user_id, state.complete);
  } catch (error) {
    showError(error, 'The field could not be updated.');
    submit.disabled = false;
  }
}

async function handleDelete(form) {
  const currentTarget = target();
  const confirmation = String(new FormData(form).get('confirmation') || '').trim();
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    state.receipt = await request({
      action: 'library_user_delete', target: currentTarget, confirmation,
      acknowledge_logical_restore: form.elements.acknowledge.checked
    }, { timeoutMs: 180000 });
    state.record = null;
    state.rows = state.rows.filter(row => String(row.user_key) !== String(currentTarget.user_key));
    showToastMessage('The user was safely removed and the backup was verified.', 'success');
    renderMain();
  } catch (error) {
    showError(error, 'The user could not be removed.');
    submit.disabled = false;
  }
}

async function runReceiptAction(action, operationId, successMessage) {
  state.loading = true;
  renderMain();
  try {
    const result = await request({ action, operation_id: operationId }, { timeoutMs: 180000 });
    state.receipt = result;
    showToastMessage(successMessage, 'success');
    if (result.user_key && result.user_id && action === 'library_user_restore') {
      state.rows = [{ user_key: result.restored_user_key || result.user_key, user_id: result.user_id, name: result.user_id }];
      await loadUser(result.restored_user_key || result.user_key, result.user_id);
      return;
    }
    if (action === 'library_user_rollback_creation') state.record = null;
    else if (state.record) await loadUser(state.record.user.user_key, state.record.user.user_id, state.complete);
  } catch (error) {
    showError(error, 'The change could not be reversed.');
  } finally { state.loading = false; renderMain(); }
}

async function loadRelated(domain, trigger) {
  trigger.disabled = true;
  trigger.textContent = 'Checking…';
  try {
    const result = await request({ action: 'library_user_related', target: target(), domain, include_identifiers: false });
    trigger.textContent = `${result.count || 0} found`;
    trigger.closest('.user-admin-related')?.classList.add('checked');
  } catch (error) {
    trigger.disabled = false;
    trigger.textContent = 'Try again';
    showError(error, 'Related records could not be checked.');
  }
}

function bindDialogEvents() {
  dialog.addEventListener('close', () => document.body.classList.remove('user-admin-open'));
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
    if (event.target.closest('[data-user-admin-close]')) dialog.close();
    if (event.target.closest('[data-user-admin-new]')) openCreateForm();
    if (event.target.closest('[data-user-admin-cancel-form]')) renderMain();
    if (event.target.closest('[data-user-admin-cancel-edit]')) event.target.closest('.user-admin-inline-editor')?.remove();
    if (event.target.closest('[data-user-admin-cancel-delete]')) event.target.closest('.user-admin-confirm-card')?.remove();
    const result = event.target.closest('[data-user-key]');
    if (result) loadUser(result.dataset.userKey, result.dataset.userId);
    const edit = event.target.closest('[data-user-admin-edit]');
    if (edit) openEditForm(edit.dataset.userAdminEdit);
    if (event.target.closest('[data-user-admin-delete]')) openDeleteConfirmation();
    if (event.target.closest('[data-user-admin-reload]') && state.record) loadUser(state.record.user.user_key, state.record.user.user_id, state.complete);
    if (event.target.closest('[data-user-admin-complete]') && state.record && !state.complete) loadUser(state.record.user.user_key, state.record.user.user_id, true);
    const related = event.target.closest('[data-user-admin-related]');
    if (related) loadRelated(related.dataset.userAdminRelated, related.querySelector('[data-related-count]'));
    const restore = event.target.closest('[data-user-admin-restore]');
    if (restore) runReceiptAction('library_user_restore', restore.dataset.userAdminRestore, 'The logical user record was restored and verified.');
    const rollbackCreate = event.target.closest('[data-user-admin-rollback-create]');
    if (rollbackCreate) runReceiptAction('library_user_rollback_creation', rollbackCreate.dataset.userAdminRollbackCreate, 'The new user was safely removed.');
    const rollbackUpdate = event.target.closest('[data-user-admin-rollback-update]');
    if (rollbackUpdate) runReceiptAction('library_user_rollback_update', rollbackUpdate.dataset.userAdminRollbackUpdate, 'The previous field value was restored and verified.');
    if (event.target.closest('[data-user-admin-apply-preset]')) applySelectedPreset();
    if (event.target.closest('[data-user-admin-save-preset]')) openPresetEditor(false);
    if (event.target.closest('[data-user-admin-edit-preset]')) openPresetEditor(true);
    if (event.target.closest('[data-user-admin-confirm-save-preset]')) savePreset();
    if (event.target.closest('[data-user-admin-cancel-preset]')) event.target.closest('[data-user-admin-preset-editor]')?.classList.add('hidden');
    if (event.target.closest('[data-user-admin-delete-preset]')) openPresetDelete();
    if (event.target.closest('[data-user-admin-confirm-delete-preset]')) deletePreset();
    if (event.target.closest('[data-user-admin-cancel-preset-delete]')) event.target.closest('[data-user-admin-preset-delete]')?.classList.add('hidden');
    if (event.target.closest('[data-user-admin-regenerate-pin]')) updatePinPreview(true);
    if (event.target.closest('[data-user-admin-copy-credentials]') && state.receipt?.credentials) {
      ClipboardUtils.copy(formatUserCredentials(state.receipt.credentials.username, state.receipt.credentials.pin), {
        successMessage: 'Username and PIN copied.', errorMessage: 'The sign-in details could not be copied.'
      });
    }
    if (event.target.closest('[data-user-admin-dismiss-credentials]') && state.receipt) {
      delete state.receipt.credentials;
      renderMain();
    }
  });
  dialog.addEventListener('submit', event => {
    event.preventDefault();
    if (event.target.id === 'user-admin-search-form') handleSearch(event.target);
    if (event.target.id === 'user-admin-create-form') handleCreate(event.target);
    if (event.target.id === 'user-admin-edit-form') handleEdit(event.target);
    if (event.target.id === 'user-admin-delete-form') handleDelete(event.target);
  });
  dialog.addEventListener('change', event => {
    if (event.target.name === 'search_mode') {
      const isName = event.target.value === 'name';
      dialog.querySelector('.user-admin-library-scope')?.classList.toggle('hidden', !isName);
      const query = dialog.querySelector('[name="query"]');
      if (query) query.placeholder = isName ? 'Enter part of a name' : `Enter an exact ${event.target.selectedOptions[0]?.textContent?.toLowerCase() || 'value'}`;
    }
    if (event.target.name === 'pin_strategy') updatePinPreview(true);
  });
  dialog.addEventListener('input', event => {
    if (event.target.name === 'first_name' || event.target.name === 'last_name') updatePinPreview(true);
    if (!event.target.matches('[data-user-admin-field-search]')) return;
    const term = event.target.value.trim().toLowerCase();
    dialog.querySelectorAll('.user-admin-field').forEach(row => {
      row.classList.toggle('hidden', term && !row.textContent.toLowerCase().includes(term));
    });
  });
}

function syncAccess() {
  const allowed = hasLibraryUserAdminAccess(getSession());
  button?.classList.toggle('hidden', !allowed);
  if (button) button.hidden = !allowed;
  if (!allowed && dialog?.open) dialog.close();
}

function initialize() {
  if (!button || button.dataset.userAdminReady === 'true') return;
  button.dataset.userAdminReady = 'true';
  button.addEventListener('click', () => {
    if (!hasLibraryUserAdminAccess(getSession())) {
      showToastMessage('User administration is available only to Brandon and Anita.', 'error');
      return;
    }
    ensureDialog().showModal();
    document.body.classList.add('user-admin-open');
    dialog.querySelector('[name="query"]')?.focus();
  });
  globalThis.addEventListener?.('query-auth:changed', syncAccess);
  syncAccess();
}

const LibraryUserAdmin = { initialize };

export { LibraryUserAdmin };
