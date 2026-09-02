const AUTHORIZED_USERS = new Set(['bt1142', 'alw3']);

function hasLibraryUserAdminAccess(session) {
  return Boolean(
    session
    && String(session.role || '').toLowerCase() === 'admin'
    && AUTHORIZED_USERS.has(String(session.username || '').trim().toLowerCase())
  );
}

function buildUserSearchPayload({ searchMode, query, library = '' }) {
  const mode = String(searchMode || 'user_id');
  const payload = {
    action: 'library_user_search',
    search_mode: mode,
    query: String(query || '').trim()
  };
  if (mode === 'name') payload.library = String(library || '').trim().toUpperCase();
  return payload;
}

function editableRawValue(field) {
  if (field?.container !== 'Core User Record' && Array.isArray(field?.subfields) && field.subfields.length) {
    return field.subfields.map(part => `|${String(part.code || '')}${String(part.value || '')}`).join('');
  }
  return typeof field?.value === 'string' ? field.value : '';
}

function buildUserUpdateTarget(user, field) {
  const target = {
    user_key: String(user?.user_key || ''),
    user_id: String(user?.user_id || ''),
    container: String(field?.container || ''),
    field: String(field?.container === 'Core User Record' ? field?.editor_field : field?.field_tag || '')
  };
  if (field?.container !== 'Core User Record') {
    target.entry_occurrence = String(field?.absolute_entry ?? '');
    if (field?.occurrence) target.field_ordinal = String(field.occurrence);
  }
  return target;
}

function buildCreateRecord(formData) {
  const read = name => String(formData.get(name) || '').trim();
  const record = {};
  for (const name of [
    'user_id', 'first_name', 'middle_name', 'last_name', 'suffix', 'preferred_name',
    'display_name', 'alternative_id', 'group_id', 'web_auth_id', 'library', 'profile',
    'expiration_date', 'title', 'department', 'preferred_language', 'user_access',
    'environment', 'charge_history_rule', 'name_display_preference', 'routing_flag',
    'category1', 'category2', 'category3', 'category4', 'category5',
    'category6', 'category7', 'category8', 'category9', 'category10'
  ]) {
    const value = read(name);
    if (value) record[name] = value;
  }
  record.user_id = String(record.user_id || '').toUpperCase();
  record.library = String(record.library || '').toUpperCase();
  record.profile = String(record.profile || '').toUpperCase();
  record.expiration_date = String(record.expiration_date || '').toUpperCase();

  const entries = [];
  for (const [name, entry] of [['street', 'STREET'], ['city_state', 'CITY/STATE'], ['zip', 'ZIP'], ['email', 'EMAIL'], ['phone', 'PHONE']]) {
    const value = read(name);
    if (value) entries.push({ entry, subfields: [{ code: 'a', value }] });
  }
  if (entries.length) record.sections = { address1: entries };
  return record;
}

const PRESET_FIELDS = [
  'library', 'profile', 'expiration_date', 'title', 'department', 'preferred_language',
  'user_access', 'environment', 'charge_history_rule', 'name_display_preference',
  'routing_flag', 'category1', 'category2', 'category3', 'category4', 'category5',
  'category6', 'category7', 'category8', 'category9', 'category10'
];

function buildPresetValues(formData) {
  const values = {};
  for (const field of PRESET_FIELDS) {
    const value = String(formData.get(field) || '').trim();
    if (value) values[field] = value;
  }
  return values;
}

function randomIndex(length, cryptoSource = globalThis.crypto) {
  if (!length) return 0;
  const buffer = new Uint32Array(1);
  cryptoSource?.getRandomValues?.(buffer);
  return buffer[0] % length;
}

function generateUserPin(strategy, firstName, lastName, cryptoSource = globalThis.crypto) {
  if (strategy === 'library_default') return '';
  const first = String(firstName || '').replace(/[^A-Za-z0-9]/g, '');
  const last = String(lastName || '').replace(/[^A-Za-z0-9]/g, '');
  const digits = () => String(randomIndex(10000, cryptoSource)).padStart(4, '0');
  if (strategy === 'name_random') {
    const stem = `${first.slice(0, 1)}${last}` || 'User';
    return `${stem}${digits()}`;
  }
  if (strategy === 'memorable') {
    const left = ['Amber', 'Cedar', 'Maple', 'River', 'Sunny', 'Velvet', 'Willow', 'Winter'];
    const right = ['Bird', 'Book', 'Cloud', 'Fox', 'Moon', 'Oak', 'Star', 'Trail'];
    return `${left[randomIndex(left.length, cryptoSource)]}${right[randomIndex(right.length, cryptoSource)]}${digits()}`;
  }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from({ length: 14 }, () => alphabet[randomIndex(alphabet.length, cryptoSource)]).join('');
}

function formatUserCredentials(username, pin) {
  return `Username: ${String(username || '')}\nPIN: ${String(pin || '')}`;
}

function isEditableUserField(field) {
  if (!field?.editable || field.visibility !== 'visible' || field.credential) return false;
  if (field.container === 'Core User Record') {
    return Boolean(field.editor_field && !['Name', 'UserID', 'PIN', 'BLUEcloudStaffID'].includes(field.editor_field));
  }
  return /^USER(?:X|A[123])$/.test(String(field.container || ''))
    && Boolean(field.field_tag)
    && Number.isFinite(Number(field.absolute_entry));
}

export {
  AUTHORIZED_USERS,
  buildCreateRecord,
  buildPresetValues,
  buildUserSearchPayload,
  buildUserUpdateTarget,
  editableRawValue,
  formatUserCredentials,
  generateUserPin,
  hasLibraryUserAdminAccess,
  isEditableUserField
};
