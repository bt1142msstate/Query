import test from 'node:test';
import assert from 'node:assert/strict';
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
} from '../../src/ui/libraryUserAdminModel.js';

test('user administration is restricted to the two protected administrators', () => {
  assert.equal(hasLibraryUserAdminAccess({ username: 'bt1142', role: 'admin' }), true);
  assert.equal(hasLibraryUserAdminAccess({ username: 'ALW3', role: 'admin' }), true);
  assert.equal(hasLibraryUserAdminAccess({ username: 'other', role: 'admin' }), false);
  assert.equal(hasLibraryUserAdminAccess({ username: 'bt1142', role: 'user' }), false);
});

test('name searches require and normalize a library scope', () => {
  assert.deepEqual(buildUserSearchPayload({ searchMode: 'name', query: ' Ada ', library: 'msu' }), {
    action: 'library_user_search', search_mode: 'name', query: 'Ada', library: 'MSU'
  });
});

test('creation separates personal record values from reusable preset values', () => {
  const entries = [
    ['user_id', 'test1'], ['first_name', 'Ada'], ['last_name', 'Lovelace'],
    ['library', 'msu'], ['profile', 'student'], ['expiration_date', 'never'],
    ['email', 'ada@example.org'], ['category1', 'STUDENT']
  ];
  const formData = new FormData();
  entries.forEach(([name, value]) => formData.set(name, value));
  const record = buildCreateRecord(formData);
  assert.equal(record.user_id, 'TEST1');
  assert.equal(record.sections.address1[0].entry, 'EMAIL');
  const preset = buildPresetValues(formData);
  assert.deepEqual(preset, { library: 'msu', profile: 'student', expiration_date: 'never', category1: 'STUDENT' });
  assert.equal('first_name' in preset, false);
  assert.equal('email' in preset, false);
});

test('default generated PIN combines name and random digits', () => {
  const cryptoSource = { getRandomValues(array) { array[0] = 42; return array; } };
  assert.equal(generateUserPin('name_random', 'Ada', 'Lovelace', cryptoSource), 'ALovelace0042');
  assert.equal(generateUserPin('library_default', 'Ada', 'Lovelace', cryptoSource), '');
  assert.equal(formatUserCredentials('ADA1', 'ALovelace0042'), 'Username: ADA1\nPIN: ALovelace0042');
});

test('structured field updates retain all subfield markers and exact occurrence', () => {
  const field = {
    id: 'usera1.email.1', container: 'USERA1', field_tag: 'EMAIL', absolute_entry: 12,
    occurrence: 1, editable: true, visibility: 'visible', subfields: [{ code: 'a', value: 'ada@example.org' }]
  };
  assert.equal(editableRawValue(field), '|aada@example.org');
  assert.deepEqual(buildUserUpdateTarget({ user_key: 101, user_id: 'ADA1' }, field), {
    user_key: '101', user_id: 'ADA1', container: 'USERA1', field: 'EMAIL', entry_occurrence: '12', field_ordinal: '1'
  });
  assert.equal(isEditableUserField(field), true);
  assert.equal(isEditableUserField({ ...field, credential: true }), false);
});
