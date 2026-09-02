#!/usr/bin/env node
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getCliAuthorizationHeaders } from './lib/queryCliAuth.mjs';
import {
  executeSirsiOperation,
  getSirsiOperationOutput,
  getSirsiOperationOutputs,
  getSirsiOperationStatus,
  postSirsiOperationsAction,
  prepareSirsiOperation,
  rollbackSirsiOperation
} from './lib/sirsiOpsClient.mjs';
import { enrollSirsiOperationsDevice } from './lib/sirsiOpsAuth.mjs';

const DEFAULT_OPS_URL = 'https://mlp.sirsi.net/uhtbin/sirsi_ops_api.pl';
const DEFAULT_RECOVERY_URL = 'https://mlp.sirsi.net/uhtbin/sirsi_ops_recovery.pl';
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
    if (key === 'operation-id' || key === 'stream') {
      if (!Array.isArray(options[key])) options[key] = [];
      options[key].push(value);
    } else {
      options[key] = value;
    }
  }
  return options;
}

function oneOption(options, key, fallback = '') {
  const value = options[key];
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error(`Option --${key} may only be used once for this command.`);
    return String(value[0]);
  }
  return String(value === undefined ? fallback : value);
}

async function main() {
  const [command = 'capabilities', ...tokens] = process.argv.slice(2);
  const options = parseOptions(tokens);
  const apiUrl = String(options['ops-url'] || process.env.SIRSI_OPS_URL || DEFAULT_OPS_URL);
  const recoveryUrl = String(options['recovery-url'] || process.env.SIRSI_OPS_RECOVERY_URL || DEFAULT_RECOVERY_URL);
  const queryApiUrl = String(options['query-api-url'] || process.env.QUERY_API_URL || DEFAULT_QUERY_URL);
  if (command === 'enroll') {
    if (!options['public-key-output']) throw new Error('Enrollment requires --public-key-output PATH.');
    const output = resolve(String(options['public-key-output']));
    const enrollment = await enrollSirsiOperationsDevice({ replace: options.replace === 'true' });
    await writeFile(output, enrollment.publicKeyPem, { flag: 'wx', mode: 0o644 });
    process.stdout.write(`Enrolled this Mac with a hardware-bound key and saved its non-secret public key to ${output}.\n`);
    return;
  }
  const sessionHeaders = await getCliAuthorizationHeaders(queryApiUrl);
  if (!sessionHeaders['X-Query-Session']) throw new Error('Pair the Query CLI first with npm run query:pair.');
  if (command === 'recovery-capabilities') {
    const result = await postSirsiOperationsAction({
      apiUrl: recoveryUrl, payload: { action: 'capabilities' }, sessionHeaders
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'recovery-status' || command === 'recovery-rollback') {
    const operationId = oneOption(options, 'operation-id');
    const result = await postSirsiOperationsAction({
      apiUrl: recoveryUrl,
      payload: { action: command === 'recovery-status' ? 'status' : 'rollback', operation_id: operationId },
      sessionHeaders
    });
    process.stdout.write(`${JSON.stringify(result.operation, null, 2)}\n`);
    return;
  }
  if (command === 'capabilities') {
    const result = await postSirsiOperationsAction({ apiUrl, payload: { action: 'capabilities' }, sessionHeaders });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'prepare') {
    if (!options.archive) throw new Error('Prepare requires --archive PATH.');
    if (!options.profile) throw new Error('Prepare requires --profile NAME.');
    const operation = await prepareSirsiOperation({
      apiUrl, profile: options.profile, archivePath: options.archive, sessionHeaders,
      onProgress: ({ received, total }) => process.stderr.write(`Uploaded ${received} of ${total} bytes.\n`)
    });
    process.stdout.write(`${JSON.stringify(operation, null, 2)}\n`);
    return;
  }
  if (command === 'outputs') {
    const operationIds = Array.isArray(options['operation-id']) ? options['operation-id'] : [];
    const streams = Array.isArray(options.stream) && options.stream.length ? options.stream : ['stdout'];
    if (!operationIds.length) throw new Error('Outputs requires at least one --operation-id ID.');
    if (!options['output-directory']) throw new Error('Outputs requires --output-directory PATH.');
    const requests = operationIds.flatMap(operationId => streams.map(stream => ({ operationId, stream })));
    const outputDirectory = resolve(String(options['output-directory']));
    await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    const results = await getSirsiOperationOutputs({ apiUrl, outputs: requests, sessionHeaders });
    const written = [];
    for (const result of results) {
      const outputPath = join(outputDirectory, `${result.operationId}.${result.stream}`);
      await writeFile(outputPath, result.data, { mode: 0o600 });
      written.push({ operation_id: result.operationId, stream: result.stream, bytes: result.data.length, path: outputPath });
    }
    process.stdout.write(`${JSON.stringify({ outputs: written }, null, 2)}\n`);
    return;
  }
  const operationId = oneOption(options, 'operation-id');
  if (command === 'output') {
    const output = await getSirsiOperationOutput({
      apiUrl, operationId, stream: oneOption(options, 'stream', 'stdout'), sessionHeaders
    });
    process.stdout.write(output);
    return;
  }
  const actions = {
    execute: executeSirsiOperation,
    status: getSirsiOperationStatus,
    rollback: rollbackSirsiOperation
  };
  if (actions[command]) {
    const operation = await actions[command]({ apiUrl, operationId, sessionHeaders });
    process.stdout.write(`${JSON.stringify(operation, null, 2)}\n`);
    return;
  }
  throw new Error('Use enroll, capabilities, prepare, execute, status, output, outputs, rollback, recovery-capabilities, recovery-status, or recovery-rollback.');
}

main().catch(error => {
  process.stderr.write(`${error.message || error}\n`);
  process.exitCode = 1;
});
