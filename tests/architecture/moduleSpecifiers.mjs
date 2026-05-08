import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourceEntries = [
  'appModules.js',
  'index.html',
  'bubbles',
  'core',
  'filters',
  'table',
  'ui'
];

const moduleSpecifierPattern = /(?:\bimport\s*(?:\([\s\n\r]*|[^'"]*?\bfrom\s*)|\bexport\s+[^'"]*?\bfrom\s*|<script\b[^>]*\btype=["']module["'][^>]*\bsrc=)\s*["']([^"']+)["']/gu;
const cacheBustedScriptPattern = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']+[?#][^"']*["']/giu;
const sourceExtensions = new Set(['.js', '.html']);

function hasSourceExtension(pathname) {
  return [...sourceExtensions].some(extension => pathname.endsWith(extension));
}

async function collectSourceFiles(entry) {
  const fullPath = resolve(rootDir, entry);
  const entryStat = await stat(fullPath);

  if (entryStat.isFile()) {
    return hasSourceExtension(fullPath) ? [fullPath] : [];
  }

  const files = [];
  const children = await readdir(fullPath);
  for (const child of children) {
    files.push(...await collectSourceFiles(`${entry}/${child}`));
  }
  return files;
}

const sourceFiles = (await Promise.all(sourceEntries.map(collectSourceFiles))).flat();
const failures = [];

for (const filePath of sourceFiles) {
  const source = await readFile(filePath, 'utf8');
  const relativePath = filePath.slice(rootDir.length + 1);

  if (cacheBustedScriptPattern.test(source)) {
    failures.push(`${relativePath}: module script src should not include a query string or hash`);
  }
  cacheBustedScriptPattern.lastIndex = 0;

  for (const match of source.matchAll(moduleSpecifierPattern)) {
    const specifier = match[1];
    if (/[?#]/u.test(specifier)) {
      failures.push(`${relativePath}: module specifier "${specifier}" should be plain and cache-stable`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Module specifier check failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
}

console.log('Module specifier check passed');
