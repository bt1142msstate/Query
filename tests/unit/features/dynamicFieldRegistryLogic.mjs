import assert from 'node:assert/strict';
import test from 'node:test';

function installStorageMock() {
  const storage = new Map();
  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    removeItem(key) {
      storage.delete(key);
    },
    setItem(key, value) {
      storage.set(key, String(value));
    }
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorage
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      clearTimeout,
      localStorage,
      setTimeout
    }
  });

  return storage;
}

test('dynamic field registry persists and removes locally built fields', async () => {
  const storage = installStorageMock();
  const [
    storageModule,
    fieldDefsModule
  ] = await Promise.all([
    import(`../../../src/features/filters/dynamicFieldStorage.js?case=${Date.now()}`),
    import(`../../../src/features/filters/fieldDefs.js?case=${Date.now()}`)
  ]);
  const {
    DYNAMIC_FIELD_STORAGE_KEY,
    readStoredDynamicFields
  } = storageModule;
  const {
    fieldDefs,
    fieldDefsArray,
    filteredDefs,
    isLocalDynamicField,
    registerDynamicField,
    removeDynamicField
  } = fieldDefsModule;

  fieldDefs.clear();
  fieldDefsArray.splice(0, fieldDefsArray.length);
  filteredDefs.splice(0, filteredDefs.length);

  const parentField = {
    name: 'Configurable Local Field',
    category: 'Dynamic',
    filters: ['contains', 'equals'],
    type: 'string',
    builder: {
      outputFieldIdTemplate: 'Configurable Local {code}',
      inputs: [{ id: 'code', pattern: '^[A-Z0-9]+$' }]
    }
  };
  fieldDefs.set(parentField.name, parentField);
  fieldDefsArray.push(parentField);
  filteredDefs.push(parentField);

  const createdField = registerDynamicField('Configurable Local 590', {
    label: 'Configurable Local 590'
  });

  assert.equal(createdField.name, 'Configurable Local 590');
  assert.equal(createdField.dynamic_parent, parentField.name);
  assert.equal(isLocalDynamicField(createdField.name), true);
  assert.equal(fieldDefs.has(createdField.name), true);
  assert.deepEqual(readStoredDynamicFields().map(field => field.name), [createdField.name]);
  assert.match(storage.get(DYNAMIC_FIELD_STORAGE_KEY), /Configurable Local 590/u);

  assert.equal(removeDynamicField(createdField.name), true);
  assert.equal(isLocalDynamicField(createdField.name), false);
  assert.equal(fieldDefs.has(createdField.name), false);
  assert.deepEqual(readStoredDynamicFields(), []);
  assert.equal(storage.has(DYNAMIC_FIELD_STORAGE_KEY), false);
});
