import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BLOCKED_TERMS = Object.freeze([
  [99, 111, 100, 101, 120],
  [99, 104, 97, 116, 103, 112, 116],
].map(codePoints => String.fromCodePoint(...codePoints)));

function normalizeAsciiByte(byte) {
  return byte >= 65 && byte <= 90 ? byte + 32 : byte;
}

export function containsBlockedTerm(value) {
  const normalized = String(value ?? '').toLowerCase();
  return BLOCKED_TERMS.some(term => normalized.includes(term));
}

export function bufferContainsBlockedTerm(buffer) {
  return BLOCKED_TERMS.some(term => {
    const needle = Buffer.from(term);
    for (let offset = 0; offset <= buffer.length - needle.length; offset += 1) {
      let matches = true;
      for (let index = 0; index < needle.length; index += 1) {
        if (normalizeAsciiByte(buffer[offset + index]) !== needle[index]) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }
    return false;
  });
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readEvent() {
  if (!process.env.GITHUB_EVENT_PATH) return {};
  try {
    return JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function revisionRange(event) {
  const before = event.before;
  const after = event.after;
  if (after && /^0+$/u.test(after)) return before || '--all';
  if (after) return after;

  const base = event.pull_request?.base?.sha;
  const head = event.pull_request?.head?.sha;
  if (base && head) return `${base}..${head}`;

  return '--all';
}

function metadataValues(event) {
  return [
    process.env.GITHUB_REF,
    process.env.GITHUB_REF_NAME,
    process.env.GITHUB_HEAD_REF,
    process.env.GITHUB_BASE_REF,
    event.pull_request?.title,
    event.pull_request?.body,
    event.pull_request?.head?.ref,
    event.release?.name,
    event.release?.body,
    event.release?.tag_name,
  ].filter(Boolean);
}

export function checkRepositoryPolicy() {
  const violations = [];
  const event = readEvent();

  for (const value of metadataValues(event)) {
    if (containsBlockedTerm(value)) violations.push('GitHub metadata');
  }

  const refs = runGit(['for-each-ref', '--format=%(refname)']);
  if (containsBlockedTerm(refs)) violations.push('Git reference');

  const trackedPaths = runGit(['ls-files', '-z']).split('\0').filter(Boolean);
  for (const path of trackedPaths) {
    if (containsBlockedTerm(path)) violations.push(`Tracked path: ${path}`);
    if (bufferContainsBlockedTerm(readFileSync(path))) violations.push(`Tracked file: ${path}`);
  }

  const range = revisionRange(event);
  const history = runGit([
    'log',
    '--format=%B',
    '--name-only',
    '--patch',
    '--text',
    '--no-color',
    range,
  ]);
  if (containsBlockedTerm(history)) violations.push('Proposed commit history');

  return [...new Set(violations)];
}

function main() {
  const violations = checkRepositoryPolicy();
  if (violations.length === 0) {
    console.log('Repository attribution policy passed.');
    return;
  }

  console.error('Repository attribution policy failed. Remove blocked attribution terms from:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
