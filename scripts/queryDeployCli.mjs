#!/usr/bin/env node
import process from 'node:process';
import { getCliAuthorizationHeaders } from './lib/queryCliAuth.mjs';
import { applyDeployment, getDeploymentStatus, postDeploymentAction, prepareDeployment } from './lib/queryDeployClient.mjs';

const DEFAULT_DEPLOY_URL = 'https://mlp.sirsi.net/uhtbin/deployment_api.pl';
const DEFAULT_QUERY_URL = 'https://mlp.sirsi.net/uhtbin/query_api.pl';

function parseOptions(tokens) {
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`Unknown argument: ${token}`);
    const equal = token.indexOf('=');
    const key = token.slice(2, equal >= 0 ? equal : undefined);
    const value = equal >= 0 ? token.slice(equal + 1) : tokens[++index];
    if (!key || value === undefined || String(value).startsWith('--')) throw new Error(`Option --${key || '?'} needs a value.`);
    options[key] = value;
  }
  return options;
}

async function main() {
  const [command = 'capabilities', ...tokens] = process.argv.slice(2);
  const options = parseOptions(tokens);
  const deployUrl = String(options['deploy-url'] || process.env.QUERY_DEPLOY_URL || DEFAULT_DEPLOY_URL);
  const queryApiUrl = String(options['api-url'] || process.env.QUERY_API_URL || DEFAULT_QUERY_URL);
  const sessionHeaders = await getCliAuthorizationHeaders(queryApiUrl);
  if (!sessionHeaders['X-Query-Session']) throw new Error('Pair the Query CLI first with npm run query:pair.');
  if (command === 'capabilities') {
    const result = await postDeploymentAction({ deployUrl, payload: { action: 'capabilities' }, sessionHeaders });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'prepare') {
    const archivePath = String(options.archive || '');
    const target = String(options.target || '');
    if (!archivePath) throw new Error('Prepare requires --archive PATH.');
    const release = await prepareDeployment({
      deployUrl, target, archivePath, sessionHeaders,
      onProgress: ({ received, total }) => process.stderr.write(`Uploaded ${received} of ${total} bytes.\n`)
    });
    process.stdout.write(`${JSON.stringify(release, null, 2)}\n`);
    return;
  }
  const releaseId = String(options['release-id'] || '');
  if (command === 'apply') {
    const release = await applyDeployment({ deployUrl, releaseId, sessionHeaders });
    process.stdout.write(`${JSON.stringify(release, null, 2)}\n`);
    return;
  }
  if (command === 'status') {
    const release = await getDeploymentStatus({ deployUrl, releaseId, sessionHeaders });
    process.stdout.write(`${JSON.stringify(release, null, 2)}\n`);
    return;
  }
  throw new Error('Use capabilities, prepare, apply, or status.');
}

main().catch(error => {
  process.stderr.write(`${error.message || error}\n`);
  process.exitCode = 1;
});
