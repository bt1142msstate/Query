import { BackendApi } from '../../core/backendApi.js';
import { fieldDefsArray } from '../../core/fieldDefs.js';
import { assertQueryRunStreamResponse } from '../../core/queryRunResponse.js';
import { readStreamedQueryResult } from '../../core/queryStream.js';

function getCompleteRecordFieldDefinitions(definitions = fieldDefsArray) {
  return (Array.isArray(definitions) ? definitions : [])
    .filter(definition => definition?.name && !definition.builder)
    .filter(definition => definition.recordDetailsAvailable !== false && definition.recordDetailsAvailable !== 0);
}

function getLookupDefinition(lookup, definitions = fieldDefsArray) {
  return (Array.isArray(definitions) ? definitions : [])
    .find(definition => definition?.recordLookupType === lookup?.lookupType);
}

function buildRecordDetailsQueryPayload(lookup, definitions = fieldDefsArray) {
  const lookupDefinition = getLookupDefinition(lookup, definitions);
  if (!lookupDefinition?.name || !lookup?.lookupValue) {
    throw new Error('This row does not include a record identifier that can load complete details.');
  }
  const fields = getCompleteRecordFieldDefinitions(definitions);
  if (!fields.length) throw new Error('The complete field list is not available yet. Try again after fields finish loading.');
  return {
    action: 'run',
    name: 'Record details',
    result_format: 'jsonl',
    display_fields: fields.map(field => field.name),
    filters: [{ field: lookupDefinition.name, operator: '=', value: String(lookup.lookupValue) }],
    max_rows: 2
  };
}

function buildRecordDetailsResponseFromQuery(streamed, lookup, definitions = fieldDefsArray) {
  const columns = Array.isArray(streamed?.jsonPayload?.columns) ? streamed.jsonPayload.columns : [];
  const rows = Array.isArray(streamed?.jsonPayload?.rows) ? streamed.jsonPayload.rows : [];
  if (!columns.length || !rows.length) throw new Error('No matching record was found.');
  const definitionsByName = new Map(getCompleteRecordFieldDefinitions(definitions)
    .map(definition => [definition.name, definition]));
  const lookupDefinition = getLookupDefinition(lookup, definitions) || {};
  const firstRow = Array.isArray(rows[0]) ? rows[0] : [];
  return {
    kind: { key: lookup.lookupType.startsWith('item_') ? 'item' : 'bibliographic', label: lookup.lookupType.startsWith('item_') ? 'Item record' : 'Bibliographic record' },
    lookup: { type: lookup.lookupType, field: lookupDefinition.name || '', value: String(lookup.lookupValue) },
    fields: columns.map((name, index) => {
      const definition = definitionsByName.get(name) || {};
      const value = firstRow[index];
      return {
        name,
        category: definition.category || 'Other',
        description: definition.desc || '',
        values: Array.isArray(value) ? value : [value ?? '']
      };
    }),
    source_row_count: rows.length
  };
}

async function fetchRecordDetailsThroughQuery(lookup, options = {}) {
  const payload = buildRecordDetailsQueryPayload(lookup, options.definitions || fieldDefsArray);
  const response = await BackendApi.request(payload, { timeoutMs: Number(options.timeoutMs) || 60000 });
  await assertQueryRunStreamResponse(response, BackendApi);
  const streamed = await readStreamedQueryResult(response);
  if (streamed.partial || streamed.streamError) throw streamed.streamError || new Error('The complete record lookup ended early. Try again.');
  return buildRecordDetailsResponseFromQuery(streamed, lookup, options.definitions || fieldDefsArray);
}

async function fetchCompleteRecordDetails(lookup, options = {}) {
  if (!lookup?.lookupType || !lookup?.lookupValue) {
    throw new Error('This row does not include a record identifier that can load complete details.');
  }
  let data;
  try {
    ({ data } = await BackendApi.postJson({
      action: 'record_details',
      lookup_type: lookup.lookupType,
      lookup_value: lookup.lookupValue
    }, {
      timeoutMs: Number(options.timeoutMs) || 60000
    }));
  } catch (error) {
    const unsupported = error?.status === 400
      && /unsupported action|incomplete or invalid|invalid query request/iu.test(`${error?.message || ''} ${error?.payload?.error || ''}`);
    if (!unsupported) throw error;
    data = await fetchRecordDetailsThroughQuery(lookup, options);
  }
  if (!Array.isArray(data?.fields) || !data.fields.length) {
    throw new Error('The backend did not return any record fields.');
  }
  return data;
}

export {
  buildRecordDetailsQueryPayload,
  buildRecordDetailsResponseFromQuery,
  fetchCompleteRecordDetails,
  getCompleteRecordFieldDefinitions
};
