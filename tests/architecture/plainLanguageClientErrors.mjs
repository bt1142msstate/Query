import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(process.cwd());
const CLIENT_ROOT = join(ROOT, 'src');

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(path);
    return /\.js$/u.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}

const forbiddenClientPatterns = [
  { label: 'toast receives raw exception text', pattern: /showToastMessage\([^\n]*(?:error|err|exception)\??\.message/gu },
  { label: 'status receives raw exception text', pattern: /set[A-Za-z]+Status\([^\n]*(?:error|err|exception)\??\.message/gu },
  { label: 'DOM receives raw exception text', pattern: /textContent\s*=\s*(?:error|err|exception)\??\.message/gu },
  { label: 'validation receives raw exception text', pattern: /renderValidation\(\[\s*(?:error|err|exception)\??\.message/gu },
  { label: 'HTML receives raw exception text', pattern: /innerHTML\s*=\s*[\s\S]{0,400}\$\{\s*(?:error|err|exception)\??\.message\s*\}/gu }
];

test('client-visible error surfaces do not receive raw exception messages', async () => {
  const failures = [];
  for (const path of await listJavaScriptFiles(CLIENT_ROOT)) {
    const source = await readFile(path, 'utf8');
    forbiddenClientPatterns.forEach(({ label, pattern }) => {
      pattern.lastIndex = 0;
      if (pattern.test(source)) failures.push(`${relative(ROOT, path)}: ${label}`);
    });
  }

  assert.deepEqual(failures, []);
});

test('CLI prints a plain client message instead of an exception stack', async () => {
  const source = await readFile(join(ROOT, 'scripts/queryCli.mjs'), 'utf8');
  assert.match(source, /getClientErrorMessage/u);
  assert.doesNotMatch(source, /error\?\.stack|error\.stack/u);
});
