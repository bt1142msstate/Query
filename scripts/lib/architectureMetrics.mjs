import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import * as espree from 'espree';

const execFileAsync = promisify(execFile);
const functionNodeTypes = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression'
]);
const nestingNodeTypes = new Set([
  'CatchClause',
  'ConditionalExpression',
  'DoWhileStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'IfStatement',
  'SwitchStatement',
  'WhileStatement'
]);

function getArchitecturalFolder(relativePath) {
  const parts = String(relativePath || '').split('/');
  if (parts[0] !== 'src') {
    return parts.slice(0, 2).join('/') || 'unknown';
  }

  if (parts[1] === 'features') {
    return parts.length >= 5 && parts[4]
      ? parts.slice(0, 4).join('/')
      : parts.slice(0, 3).join('/');
  }

  if (parts[1] === 'components' || parts[1] === 'lib' || parts[1] === 'ui') {
    return parts.length >= 4 && parts[3]
      ? parts.slice(0, 3).join('/')
      : parts.slice(0, 2).join('/');
  }

  if (parts[1] === 'core' && parts[2] === 'formatting') {
    return 'src/core/formatting';
  }

  if (parts[1] === 'styles') {
    return 'src/styles';
  }

  return parts.slice(0, 2).join('/');
}

function summarizeFolderModularity(graphReport) {
  const folders = new Map();

  function ensureFolder(folderPath) {
    if (!folders.has(folderPath)) {
      folders.set(folderPath, {
        externalImports: 0,
        folder: folderPath,
        incomingExternalImports: 0,
        internalImports: 0,
        modules: [],
        outgoingFolders: new Map()
      });
    }
    return folders.get(folderPath);
  }

  for (const moduleMetrics of graphReport.modules.values()) {
    const folder = getArchitecturalFolder(moduleMetrics.path);
    ensureFolder(folder).modules.push(moduleMetrics.path);
  }

  for (const moduleMetrics of graphReport.modules.values()) {
    const sourceFolder = getArchitecturalFolder(moduleMetrics.path);
    const sourceSummary = ensureFolder(sourceFolder);

    for (const importedPath of moduleMetrics.imports) {
      const targetFolder = getArchitecturalFolder(importedPath);
      if (targetFolder === sourceFolder) {
        sourceSummary.internalImports += 1;
        continue;
      }

      sourceSummary.externalImports += 1;
      sourceSummary.outgoingFolders.set(
        targetFolder,
        (sourceSummary.outgoingFolders.get(targetFolder) || 0) + 1
      );
      ensureFolder(targetFolder).incomingExternalImports += 1;
    }
  }

  return [...folders.values()]
    .map(folder => {
      const totalImports = folder.internalImports + folder.externalImports;
      const moduleCount = folder.modules.length;
      return {
        ...folder,
        externalImportsPerModule: folder.externalImports / Math.max(1, moduleCount),
        externalImportRatio: folder.externalImports / Math.max(1, totalImports),
        incomingExternalImportsPerModule: folder.incomingExternalImports / Math.max(1, moduleCount),
        internalImportRatio: folder.internalImports / Math.max(1, totalImports),
        moduleCount,
        outgoingFolders: [...folder.outgoingFolders.entries()]
          .map(([targetFolder, count]) => ({ count, targetFolder }))
          .toSorted((left, right) => right.count - left.count || left.targetFolder.localeCompare(right.targetFolder)),
        totalImports
      };
    })
    .toSorted((left, right) =>
      right.externalImportsPerModule - left.externalImportsPerModule
      || right.externalImports - left.externalImports
      || left.folder.localeCompare(right.folder)
    );
}

function parseJavaScript(source, filePath) {
  return espree.parse(source, {
    ecmaVersion: 'latest',
    loc: true,
    range: true,
    sourceType: 'module',
    tolerant: true
  });
}

function getFunctionName(node, parent) {
  if (node.id?.name) {
    return node.id.name;
  }
  if (parent?.type === 'VariableDeclarator' && parent.id?.name) {
    return parent.id.name;
  }
  if (parent?.type === 'Property' && parent.key?.name) {
    return parent.key.name;
  }
  if (parent?.type === 'MethodDefinition' && parent.key?.name) {
    return parent.key.name;
  }
  return '<anonymous>';
}

function getChildNodes(node) {
  return Object.keys(node)
    .filter(key => key !== 'parent')
    .flatMap(key => {
      const value = node[key];
      if (Array.isArray(value)) {
        return value.filter(child => child && typeof child.type === 'string');
      }
      return value && typeof value.type === 'string' ? [value] : [];
    });
}

function walkAst(node, visitor, parent = null) {
  if (!node || typeof node.type !== 'string') {
    return;
  }

  visitor(node, parent);
  for (const child of getChildNodes(node)) {
    walkAst(child, visitor, node);
  }
}

function countLogicalSequences(node) {
  let count = 0;
  let previousOperator = null;

  function visitLogical(logicalNode) {
    if (logicalNode.type !== 'LogicalExpression') {
      return;
    }
    if (logicalNode.operator === '&&' || logicalNode.operator === '||') {
      if (logicalNode.operator !== previousOperator) {
        count += 1;
        previousOperator = logicalNode.operator;
      }
    }
    visitLogical(logicalNode.left);
    visitLogical(logicalNode.right);
  }

  visitLogical(node);
  return count;
}

function calculateFunctionCognitiveComplexity(functionNode) {
  let score = 0;

  function visit(node, nesting = 0, parent = null) {
    if (!node || typeof node.type !== 'string') {
      return;
    }

    if (node !== functionNode && functionNodeTypes.has(node.type)) {
      return;
    }

    let nextNesting = nesting;
    if (node !== functionNode) {
      if (node.type === 'IfStatement' && parent?.type === 'IfStatement' && parent.alternate === node) {
        score += 1;
      } else if (nestingNodeTypes.has(node.type)) {
        score += 1 + nesting;
        nextNesting += 1;
      }

      if (node.type === 'LogicalExpression' && parent?.type !== 'LogicalExpression') {
        score += countLogicalSequences(node);
      }
    }

    for (const child of getChildNodes(node)) {
      visit(child, nextNesting, node);
    }
  }

  visit(functionNode, 0, null);
  return score;
}

async function collectCognitiveComplexity({ rootDir, modules }) {
  const results = [];

  for (const moduleMetrics of modules) {
    const source = await readFile(`${rootDir}/${moduleMetrics.path}`, 'utf8');
    const ast = parseJavaScript(source, moduleMetrics.path);

    walkAst(ast, (node, parent) => {
      if (!functionNodeTypes.has(node.type)) {
        return;
      }

      results.push({
        complexity: calculateFunctionCognitiveComplexity(node),
        functionName: getFunctionName(node, parent),
        layer: moduleMetrics.layer,
        line: node.loc?.start?.line || 1,
        path: moduleMetrics.path
      });
    });
  }

  return results.toSorted((left, right) =>
    right.complexity - left.complexity
    || left.path.localeCompare(right.path)
    || left.line - right.line
  );
}

function normalizeChangedFile(filePath, knownFiles) {
  const normalized = String(filePath || '').trim();
  if (!normalized || !knownFiles.has(normalized)) {
    return '';
  }
  return normalized;
}

async function collectGitChangeCoupling({
  rootDir,
  knownFiles,
  commitLimit = 250,
  maxFilesPerCommit = 25
}) {
  const args = [
    'log',
    `-${commitLimit}`,
    '--pretty=format:--COMMIT--%H',
    '--name-only',
    '--',
    'src'
  ];
  const { stdout } = await execFileAsync('git', args, { cwd: rootDir, maxBuffer: 1024 * 1024 * 12 });
  const commits = stdout.split('--COMMIT--').slice(1);
  const fileChangeCounts = new Map();
  const pairCounts = new Map();
  let analyzedCommitCount = 0;
  let skippedBulkCommitCount = 0;

  for (const commitText of commits) {
    const lines = commitText.split('\n').map(line => line.trim()).filter(Boolean);
    const changedFiles = [...new Set(lines.slice(1)
      .map(filePath => normalizeChangedFile(filePath, knownFiles))
      .filter(Boolean))].sort();

    if (changedFiles.length < 2) {
      continue;
    }

    if (changedFiles.length > maxFilesPerCommit) {
      skippedBulkCommitCount += 1;
      continue;
    }

    analyzedCommitCount += 1;
    changedFiles.forEach(filePath => {
      fileChangeCounts.set(filePath, (fileChangeCounts.get(filePath) || 0) + 1);
    });

    for (let leftIndex = 0; leftIndex < changedFiles.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < changedFiles.length; rightIndex += 1) {
        const left = changedFiles[leftIndex];
        const right = changedFiles[rightIndex];
        const key = `${left}\u0000${right}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }

  const pairs = [...pairCounts.entries()].map(([key, coChanges]) => {
    const [left, right] = key.split('\u0000');
    const leftChanges = fileChangeCounts.get(left) || 0;
    const rightChanges = fileChangeCounts.get(right) || 0;
    const leftFolder = getArchitecturalFolder(left);
    const rightFolder = getArchitecturalFolder(right);
    return {
      coChanges,
      confidence: coChanges / Math.max(1, Math.min(leftChanges, rightChanges)),
      left,
      leftChanges,
      leftFolder,
      right,
      rightChanges,
      rightFolder,
      sameFolder: leftFolder === rightFolder
    };
  }).toSorted((left, right) =>
    right.coChanges - left.coChanges
    || right.confidence - left.confidence
    || left.left.localeCompare(right.left)
    || left.right.localeCompare(right.right)
  );

  return {
    analyzedCommitCount,
    fileChangeCounts,
    pairs,
    skippedBulkCommitCount
  };
}

export {
  collectCognitiveComplexity,
  collectGitChangeCoupling,
  getArchitecturalFolder,
  summarizeFolderModularity
};
