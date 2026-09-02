import { createServer } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

import {
  attachFailureListeners,
  closeServer,
  installQueryApiStub,
  listen,
  serveStaticFile,
  stubExternalAssets,
  waitForAppReady
} from './support/browserSmokeSupport.mjs';

const initialRecord = {
  user: { user_key: '101', user_id: 'MLPTESTVIEW1', name: 'Viewer, Test', library: 'MSU', profile: 'STUDENT', title: 'OLD' },
  coverage: { field_instance_count: 3, source_count: 2 },
  fields: [
    { id: 'core.USER_NAME.1', label: 'Name', group: 'core', source: 'dumpflatuser', container: 'Core User Record', field_tag: 'USER_NAME', editor_field: 'Name', value: 'Viewer, Test', visibility: 'visible', editable: true },
    { id: 'core.USER_TITLE.1', label: 'Title', group: 'core', source: 'dumpflatuser', container: 'Core User Record', field_tag: 'USER_TITLE', editor_field: 'Title', value: 'OLD', visibility: 'visible', editable: true },
    { id: 'related.charges', label: 'Current checkouts', group: 'related', source: 'selcharge', value: { load_state: 'available_on_request' }, visibility: 'visible', editable: false }
  ],
  groups: [
    { id: 'core', label: 'Core user record', source: 'dumpflatuser', fields: [] },
    { id: 'related', label: 'Related user records', source: 'related selectors', fields: [] }
  ]
};
initialRecord.groups[0].fields = initialRecord.fields.slice(0, 2);
initialRecord.groups[1].fields = initialRecord.fields.slice(2);

function response(action, body) {
  return { action, body: JSON.stringify(body), contentType: 'application/json; charset=utf-8' };
}

test('restricted user workspace supports search, full review, edit, presets, generated PIN creation, and safe removal', { timeout: 60000 }, async () => {
  const server = createServer(serveStaticFile);
  const port = await listen(server);
  const failures = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => sessionStorage.setItem('query-project.session', JSON.stringify({
      token: 'user-admin-session', username: 'bt1142', role: 'admin', display_name: 'Brandon Temple'
    })));
    attachFailureListeners(page, failures, port);
    await stubExternalAssets(page);
    const api = await installQueryApiStub(page);
    api.enqueue([
      response('library_user_search', { rows: [{ user_key: '101', user_id: 'MLPTESTVIEW1', name: 'Viewer, Test', library: 'MSU', profile: 'STUDENT' }], matched_count: 1 }),
      response('library_user_view', initialRecord),
      response('library_user_update', { action: 'update', state: 'applied', operation_id: 'a'.repeat(32), rollback_available: true }),
      response('library_user_view', { ...initialRecord, user: { ...initialRecord.user, title: 'NEW' } }),
      response('library_user_preset_list', { presets: [{ preset_id: 'b'.repeat(32), name: 'MSU student worker', description: 'Role defaults', values: { library: 'MSU', profile: 'STUDENT', title: 'STWK', expiration_date: 'NEVER' } }] }),
      response('library_user_preset_save', { preset: { preset_id: 'c'.repeat(32), name: 'MSU evening worker', description: '', values: { library: 'MSU', profile: 'STUDENT', title: 'STWK', expiration_date: 'NEVER' } } }),
      response('library_user_create', { action: 'create', state: 'applied', operation_id: 'd'.repeat(32), user_key: '202', user_id: 'MLPTESTCREATE1', rollback_available: true }),
      response('library_user_view', { ...initialRecord, user: { user_key: '202', user_id: 'MLPTESTCREATE1', name: 'Worker, Sample', library: 'MSU', profile: 'STUDENT', title: 'STWK' } }),
      response('library_user_delete', { action: 'delete', state: 'deleted', operation_id: 'e'.repeat(32), user_key: '202', user_id: 'MLPTESTCREATE1', rollback_available: true })
    ]);

    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await waitForAppReady(page, failures);
    const usersButton = page.locator('#toggle-library-user-admin');
    await usersButton.waitFor({ state: 'visible' });
    await usersButton.click();
    await page.locator('#library-user-admin-dialog').waitFor({ state: 'visible' });

    await page.locator('#user-admin-search-form [name="query"]').fill('MLPTESTVIEW1');
    await page.locator('#user-admin-search-form [type="submit"]').click();
    await page.getByRole('heading', { name: 'Viewer, Test' }).waitFor();
    if (process.env.QUERY_USER_ADMIN_SCREENSHOT) {
      await page.screenshot({ path: `${process.env.QUERY_USER_ADMIN_SCREENSHOT}-record.png`, fullPage: true });
    }
    await page.locator('[data-user-admin-edit="core.USER_TITLE.1"]').click();
    await page.locator('#user-admin-edit-form [name="new_value"]').fill('NEW');
    await page.locator('#user-admin-edit-form [type="submit"]').click();
    await page.getByText('Verified change').waitFor();

    await page.locator('[data-user-admin-new]').click();
    await page.locator('[name="preset_id"]').selectOption('b'.repeat(32));
    await page.locator('[data-user-admin-apply-preset]').click();
    assert.equal(await page.locator('#user-admin-create-form [name="library"]').inputValue(), 'MSU');
    assert.equal(await page.locator('#user-admin-create-form [name="profile"]').inputValue(), 'STUDENT');

    await page.locator('#user-admin-create-form [name="user_id"]').fill('MLPTESTCREATE1');
    await page.locator('#user-admin-create-form [name="first_name"]').fill('Sample');
    await page.locator('#user-admin-create-form [name="last_name"]').fill('Worker');
    const generatedPin = await page.locator('#user-admin-create-form [name="pin_preview"]').inputValue();
    assert.match(generatedPin, /^SWorker\d{4}$/u);
    if (process.env.QUERY_USER_ADMIN_SCREENSHOT) {
      await page.screenshot({ path: `${process.env.QUERY_USER_ADMIN_SCREENSHOT}-create.png`, fullPage: true });
    }

    await page.locator('[data-user-admin-save-preset]').click();
    await page.locator('[name="preset_name"]').fill('MSU evening worker');
    await page.locator('[data-user-admin-confirm-save-preset]').click();
    await page.locator('[name="preset_id"]').selectOption('c'.repeat(32));

    await page.locator('#user-admin-create-form > .user-admin-form-actions [type="submit"]').click();
    await page.getByText('One-time sign-in details').waitFor();
    await page.locator('[data-user-admin-delete]').click();
    await page.locator('#user-admin-delete-form [name="confirmation"]').fill('DELETE MLPTESTCREATE1');
    await page.locator('#user-admin-delete-form [name="acknowledge"]').check();
    await page.locator('#user-admin-delete-form [type="submit"]').click();
    await page.getByRole('button', { name: 'Restore deleted user' }).waitFor();

    const createRequest = api.getRequests('library_user_create')[0];
    assert.equal('pin' in createRequest.payload, false);
    assert.equal('pin' in createRequest.payload.record, false);
    assert.equal(createRequest.payload.pin_action, 'set_from_ephemeral_input');
    assert.equal(createRequest.headers['x-library-user-secret'], generatedPin);
    assert.deepEqual(api.getRequests('library_user_update')[0].payload.target, {
      user_key: '101', user_id: 'MLPTESTVIEW1', container: 'Core User Record', field: 'Title'
    });
    assert.equal(api.getRequests('library_user_delete')[0].payload.confirmation, 'DELETE MLPTESTCREATE1');
    assert.deepEqual(failures, []);
    await api.dispose();
  } finally {
    await browser?.close();
    await closeServer(server);
  }
});

test('user workspace control stays hidden from other staff', { timeout: 30000 }, async () => {
  const server = createServer(serveStaticFile);
  const port = await listen(server);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => sessionStorage.setItem('query-project.session', JSON.stringify({
      token: 'standard-session', username: 'standard', role: 'user'
    })));
    await stubExternalAssets(page);
    const api = await installQueryApiStub(page);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await waitForAppReady(page, []);
    assert.equal(await page.locator('#toggle-library-user-admin').isHidden(), true);
    await api.dispose();
  } finally {
    await browser?.close();
    await closeServer(server);
  }
});
