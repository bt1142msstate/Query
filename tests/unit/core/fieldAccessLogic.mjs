import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getFieldAccessState,
  isFieldAccessAuthorized,
  isFieldAuthRequired,
  isFieldSensitive
} from '../../../src/core/fieldAccess.js';

test('field access treats sensitive authenticated fields as usable when not denied', () => {
  const state = getFieldAccessState({
    name: 'Checkout User Name',
    sensitive: true,
    requiresAuth: true,
    requiredScopes: ['reports:sensitive']
  });

  assert.deepEqual(state, {
    authorized: true,
    message: '',
    requiredScopes: ['reports:sensitive'],
    requiresAuth: true,
    sensitive: true
  });
  assert.equal(isFieldSensitive({ sensitive: true }), true);
  assert.equal(isFieldAuthRequired({ requiredScopes: ['reports:sensitive'] }), true);
});

test('field access detects denied and unavailable fields', () => {
  const state = getFieldAccessState({
    access: 'unauthorized',
    authMessage: 'Sign in first.',
    requiredScopes: 'reports:sensitive, circulation'
  });

  assert.equal(state.authorized, false);
  assert.equal(state.requiresAuth, true);
  assert.equal(state.message, 'Sign in first.');
  assert.deepEqual(state.requiredScopes, ['reports:sensitive', 'circulation']);
  assert.equal(isFieldAccessAuthorized({ authorized: false }), false);
  assert.equal(isFieldAccessAuthorized({ available: false }), false);
});
