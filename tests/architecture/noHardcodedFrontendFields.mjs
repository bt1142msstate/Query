import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('no hardcoded frontend fields', async () => {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const require = createRequire(import.meta.url);
  const { sourceEntries } = require('../../config/architectureRules.cjs');

  const fallbackBackendFieldNames = [
    'Academic Reserve Status',
    'Author',
    'Bill Count',
    'Bound-with Level',
    'Call Number',
    'Call Number Count',
    'Call Number Input Strings',
    'Call Number Key',
    'Call Number Library',
    'Call Number Shadowed',
    'Call Number System Date Modified',
    'Call-Level Hold Count',
    'Catalog Date Created',
    'Catalog Key',
    'Catalog Shadowed',
    'Catalog System Date Modified',
    'Category1',
    'Category10',
    'Category2',
    'Category3',
    'Category4',
    'Category5',
    'Category6',
    'Category7',
    'Category8',
    'Category9',
    'Charge Count',
    'Child-boundwith',
    'Classification',
    'Collection Category',
    'Copies on Open Order',
    'Copies on Reserve',
    'Copy Count',
    'Copy Hold Count',
    'Created By',
    'Current Location',
    'Date Cataloged',
    'Date Inventoried',
    'Date Last Charged',
    'Date Last Discharged',
    'Date Last Modified',
    'Date Last Used',
    'Extended Info Ved',
    'Flexible Key',
    'Format',
    'Home Location',
    'In House Charges',
    'Item Date Created',
    'Item Id',
    'Item Key',
    'Item Library',
    'Item Shadowed',
    'Item System Date Modified',
    'Item Total Charges',
    'Item Type',
    'Library Count',
    'MARC Field',
    'Modified By',
    'Non-shadowed Current Location',
    'Permanent',
    'Pieces',
    'Price',
    'Public Note',
    'Reserve Control Records',
    'Selcallnum',
    'Selcallnum,Prtentry',
    'Selcallnum,Selcatalog',
    'Selcallnum,Selcharge',
    'Selcallnum,Selitem',
    'Selcatalog',
    'Selcatalog,Prtentry',
    'Selcatalog,Selcallnum',
    'Selcatalog,Selcharge',
    'Selcatalog,Selitem',
    'Selcharge',
    'Selcharge,Selcallnum',
    'Selcharge,Selcatalog',
    'Selcharge,Selitem',
    'Selitem',
    'Selitem,Prtentry',
    'Selitem,Selcallnum',
    'Selitem,Selcatalog',
    'Selitem,Selcharge',
    'Selitem,Seltransit',
    'Seltransit',
    'Seltransit,Prtentry',
    'Seltransit,Selcallnum',
    'Seltransit,Selcatalog',
    'Seltransit,Selitem',
    'Shadow Call Number Count',
    'Shelving Key',
    'Subject Display',
    'Times Inventoried',
    'Title',
    'Title Hold Count',
    'Total Checkouts',
    'Total Holds',
    'Total Renewals',
    'Transit Creating Library',
    'Transit Date Sent',
    'Transit Destination Library',
    'Transit Hold Key',
    'Transit Reason',
    'Transit Source Library',
    'Transit Status',
    'Visible Call Number Count',
    'Visible Copies',
    'Year of Publication'
  ];

  const extraFrontendEntries = [
    'backgroundNotificationServiceWorker.js',
    'index.html'
  ];

  const fieldCatalogPatterns = [
    {
      pattern: /\bfieldDefs\.set\(\s*['"`]/u,
      reason: 'Field definitions must be loaded from backend metadata, not seeded with literal names.'
    },
    {
      pattern: /\b(?:display_fields|displayedFields|DesiredColumnOrder)\s*[:=]\s*\[\s*['"`]/u,
      reason: 'Displayed field lists must come from query state, history, or backend metadata, not literal arrays.'
    },
    {
      pattern: /\b(?:fieldDefsArray|availableFields|fieldDefinitions)\s*=\s*\[\s*[{]/u,
      reason: 'Frontend modules must not define local field catalogs.'
    }
  ];

  function toRepoPath(filePath) {
    return relative(rootDir, filePath).split(sep).join('/');
  }

  async function pathExists(pathname) {
    try {
      await stat(pathname);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function collectSourceFiles(entry) {
    const fullPath = resolve(rootDir, entry);
    const entryStat = await stat(fullPath);

    if (entryStat.isFile()) {
      return ['.js', '.mjs', '.cjs', '.html', '.css'].includes(extname(fullPath)) ? [fullPath] : [];
    }

    const files = [];
    const children = await readdir(fullPath);
    for (const child of children) {
      files.push(...await collectSourceFiles(`${entry}/${child}`));
    }
    return files;
  }

  async function loadBackendFieldNames() {
    const localBackendPath = resolve(rootDir, '../Documentation/Backend/SirsiCommandCreator.pm');
    if (!await pathExists(localBackendPath)) {
      return fallbackBackendFieldNames;
    }

    const source = await readFile(localBackendPath, 'utf8');
    const names = [...source.matchAll(/^\s*"([^"]+)"\s*=>\s*\[/gmu)]
      .map(match => match[1]);
    names.push('MARC Field');

    return [...new Set(names)];
  }

  function findStringLiterals(source) {
    const literals = [];
    const stringPattern = /(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`)/gsu;

    for (const match of source.matchAll(stringPattern)) {
      literals.push(match[1] ?? match[2] ?? match[3] ?? '');
    }

    return literals;
  }

  function isForbiddenFieldLiteral(literal, fieldName) {
    if (literal === fieldName) {
      return true;
    }

    if (fieldName.includes(' ') && literal.includes(fieldName)) {
      return true;
    }

    return /^MARC(?:\s|\{|$)/u.test(literal);
  }

  const entries = [...new Set([...sourceEntries, ...extraFrontendEntries])];
  const sourceFiles = (await Promise.all(entries.map(collectSourceFiles))).flat();
  const backendFieldNames = await loadBackendFieldNames();
  const violations = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, 'utf8');
    const repoPath = toRepoPath(filePath);

    fieldCatalogPatterns.forEach(({ pattern, reason }) => {
      if (pattern.test(source)) {
        violations.push(`${repoPath}: ${reason}`);
      }
    });

    const literals = findStringLiterals(source);
    literals.forEach(literal => {
      backendFieldNames.forEach(fieldName => {
        if (isForbiddenFieldLiteral(literal, fieldName)) {
          violations.push(`${repoPath}: hardcoded backend field literal "${fieldName}" found in "${literal.slice(0, 120)}"`);
        }
      });
    });
  }

  if (violations.length) {
    throw new Error(`Frontend field metadata must remain backend-driven. Violations:\n${violations.map(violation => `- ${violation}`).join('\n')}`);
  }
});
