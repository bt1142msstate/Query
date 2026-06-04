import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(rootDir, 'cache-bust.json');
const sourceEntries = [
  'index.html',
  'appModules.js',
  'backgroundNotificationServiceWorker.js',
  'bubbles',
  'core',
  'filters',
  'history',
  'table',
  'templates',
  'ui',
  'styles'
];
const hashedExtensions = new Set(['.css', '.html', '.js']);
const checkOnly = process.argv.includes('--check');
const sourceOverrides = new Map();

function toRepoPath(filePath) {
  return relative(rootDir, filePath).split(sep).join('/');
}

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readAssetFile(filePath) {
  return sourceOverrides.get(filePath) || readFile(filePath);
}

async function collectAssetFiles(entry) {
  const fullPath = resolve(rootDir, entry);
  const entryStat = await stat(fullPath);

  if (entryStat.isFile()) {
    return hashedExtensions.has(extname(fullPath).toLowerCase()) ? [fullPath] : [];
  }

  const files = [];
  const children = await readdir(fullPath);
  for (const child of children) {
    files.push(...await collectAssetFiles(`${entry}/${child}`));
  }
  return files;
}

async function getExpectedStylesheetHubSource() {
  const appStylesheetPath = resolve(rootDir, 'styles/app.css');
  const source = await readFile(appStylesheetPath, 'utf8');
  const importPattern = /@import\s+url\((["'])(\.\/[^"')?#]+\.css)(?:\?v=[^"')]+)?\1\);/gu;
  const importedHashes = new Map();

  for (const match of source.matchAll(importPattern)) {
    const importPath = match[2];
    if (importedHashes.has(importPath)) continue;
    const importedFilePath = resolve(dirname(appStylesheetPath), importPath);
    const importedContents = await readAssetFile(importedFilePath);
    importedHashes.set(importPath, hashBuffer(importedContents).slice(0, 16));
  }

  return source.replace(importPattern, (match, quote, importPath) => {
    return `@import url(${quote}${importPath}?v=${importedHashes.get(importPath)}${quote});`;
  });
}

async function refreshStylesheetHub() {
  const appStylesheetPath = resolve(rootDir, 'styles/app.css');
  const expectedSource = await getExpectedStylesheetHubSource();
  const expectedBuffer = Buffer.from(expectedSource, 'utf8');
  const currentSource = await readFile(appStylesheetPath, 'utf8');

  sourceOverrides.set(appStylesheetPath, expectedBuffer);

  if (currentSource === expectedSource) {
    return;
  }

  if (checkOnly) {
    throw new Error('styles/app.css has stale @import cache keys. Run npm run cache:bust.');
  }

  await writeFile(appStylesheetPath, expectedSource);
}

async function buildManifest() {
  const files = (await Promise.all(sourceEntries.map(collectAssetFiles))).flat()
    .sort((left, right) => toRepoPath(left).localeCompare(toRepoPath(right)));
  const assets = {};

  for (const filePath of files) {
    const repoPath = toRepoPath(filePath);
    const contents = await readAssetFile(filePath);
    assets[repoPath] = hashBuffer(contents).slice(0, 16);
  }

  const versionSource = Object.entries(assets)
    .map(([path, hash]) => `${path}:${hash}`)
    .join('\n');
  const version = hashBuffer(Buffer.from(versionSource, 'utf8')).slice(0, 16);

  return {
    version,
    generatedBy: 'scripts/updateCacheBusting.mjs',
    assets
  };
}

await refreshStylesheetHub();
const manifest = await buildManifest();
const nextManifest = `${JSON.stringify(manifest, null, 2)}\n`;

if (checkOnly) {
  let currentManifest = '';
  try {
    currentManifest = await readFile(manifestPath, 'utf8');
  } catch {
    throw new Error('cache-bust.json is missing. Run npm run cache:bust.');
  }

  if (currentManifest !== nextManifest) {
    throw new Error('cache-bust.json is stale. Run npm run cache:bust and commit the updated manifest.');
  }

  console.log(`Cache manifest is current: ${manifest.version}`);
} else {
  await writeFile(manifestPath, nextManifest);
  console.log(`Updated cache-bust.json: ${manifest.version}`);
}
