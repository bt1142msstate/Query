import assert from 'node:assert/strict';
import { mapStatusPayloadToHistoryRows } from '../../src/features/history/queryHistoryStatusMapper.js';
import test from 'node:test';

test('query history status mapper', async () => {
  const now = new Date('2026/05/24 12:00:30').getTime();
  const payload = {
    queries: {
      '100': {
        status: 'complete',
        start_time: '2026-05-24 11:59:00',
        end_time: '2026-05-24 12:00:00',
        row_count: 12,
        request: {
          name: 'Completed from request',
          DesiredColumnOrder: ['Title']
        }
      },
      '101': {
        name: 'Running query',
        status: 'running',
        start_time: '2026-05-24 12:00:00',
        progress: {
          stage: 'loading_dynamic_fields',
          label: 'Loading requested field values',
          detail: 'Preparing additional result fields',
          current: '250',
          total: 1000,
          unit: 'records',
          counters: {
            candidate_rows: 1000,
            lookup_keys: '300'
          }
        },
        request: {
          name: 'Fallback name',
          ui_config: { DesiredColumnOrder: ['User ID'] }
        }
      },
      '099': {
        status: 'failed',
        warning: 'Backend disconnected',
        error_details: {
          stage: 'loading_dynamic_fields',
          component: 'marc_enrichment',
          code: 'catalogdump_failed',
          message: 'catalogdump failed with exit code 2',
          hint: 'Check catalogdump permissions.',
          exit_code: 2,
          context: {
            candidate_rows: 42
          }
        }
      }
    }
  };

  const rows = mapStatusPayloadToHistoryRows(payload, {
    now,
    classifyQueryStatus(status) {
      if (status === 'running') return 'running';
      if (status === 'complete') return 'complete';
      if (status === 'canceled') return 'canceled';
      return 'failed';
    },
    buildUiConfigFromRequest(request) {
      return { source: 'request', name: request.name };
    },
    mergeUiConfigWithRequest(uiConfig, request) {
      return { source: 'ui_config', uiConfig, name: request.name };
    },
    mapperDependencies: {}
  });

  assert.deepEqual(rows.map(row => row.id), ['101', '100', '099']);
  assert.equal(rows[0].name, 'Running query');
  assert.equal(rows[0].running, true);
  assert.equal(rows[0].duration, '30s...');
  assert.equal(rows[0].resultCount, '-');
  assert.equal(rows[0].jsonConfig.source, 'ui_config');
  assert.deepEqual(rows[0].progress, {
    schemaVersion: 1,
    stage: 'loading_dynamic_fields',
    label: 'Loading requested field values',
    detail: 'Preparing additional result fields',
    current: 250,
    total: 1000,
    percent: 25,
    unit: 'records',
    counters: {
      candidate_rows: 1000,
      lookup_keys: 300
    },
    updatedAt: '',
    updatedEpoch: null
  });

  assert.equal(rows[1].name, 'Completed from request');
  assert.equal(rows[1].running, false);
  assert.equal(rows[1].failed, false);
  assert.equal(rows[1].duration, '60s');
  assert.equal(rows[1].resultCount, 12);
  assert.equal(rows[1].jsonConfig.source, 'request');

  assert.equal(rows[2].failed, true);
  assert.equal(rows[2].error, 'Backend disconnected');
  assert.deepEqual(rows[2].errorDetails, {
    schemaVersion: 1,
    stage: 'loading_dynamic_fields',
    component: 'marc_enrichment',
    code: 'catalogdump_failed',
    message: 'catalogdump failed with exit code 2',
    hint: 'Check catalogdump permissions.',
    command: '',
    exitCode: 2,
    occurredAt: '',
    occurredEpoch: null,
    context: {
      candidate_rows: 42
    }
  });
  assert.equal(rows[2].jsonConfig, null);

  assert.deepEqual(mapStatusPayloadToHistoryRows(null), []);
});
