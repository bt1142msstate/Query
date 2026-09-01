#!/usr/bin/env node
import process from 'node:process';
import { getCliAuthorizationHeaders } from './lib/queryCliAuth.mjs';
import { buildDeploymentHeaders } from './lib/queryDeployAuth.mjs';

const DEFAULT_DEPLOY_URL = 'https://mlp.sirsi.net/uhtbin/deployment_api.pl';

async function main() {
  const [command = 'capabilities', ...tokens] = process.argv.slice(2);
  const options = Object.fromEntries(tokens.map(token => {
    const match = /^--([^=]+)=(.*)$/u.exec(token);
    if (!match) throw new Error(`Unknown option: ${token}`);
    return [match[1], match[2]];
  }));
  if (command !== 'capabilities') throw new Error('Only the deployment capabilities check is available before server bootstrap completes.');
  const deployUrl = String(options['deploy-url'] || process.env.QUERY_DEPLOY_URL || DEFAULT_DEPLOY_URL);
  const queryApiUrl = String(options['api-url'] || process.env.QUERY_API_URL || 'https://mlp.sirsi.net/uhtbin/query_api.pl');
  const body = JSON.stringify({ action: 'capabilities' });
  const sessionHeaders = await getCliAuthorizationHeaders(queryApiUrl);
  if (!sessionHeaders['X-Query-Session']) throw new Error('Pair the Query CLI first with npm run query:pair.');
  const headers = await buildDeploymentHeaders({ apiUrl: deployUrl, body, sessionHeaders });
  const response = await fetch(deployUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Deployment API returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  process.stdout.write(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message || error}\n`);
  process.exitCode = 1;
});
