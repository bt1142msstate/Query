const DEMO_API_PATH = '/demo-api';
const DEMO_TOKEN = 'query-project-demo-session';

let dataPromise = null;
let bibDataPromise = null;
const demoHydrationRuns = new Map();

function loadDemoData() {
  if (!dataPromise) {
    const url = new URL('../../assets/demo/query-data.json', import.meta.url);
    dataPromise = globalThis.fetch(url).then(response => {
      if (!response.ok) throw new Error('The sample catalog could not be loaded.');
      return response.json();
    });
  }
  return dataPromise;
}

function loadDemoBibData() {
  if (!bibDataPromise) {
    const url = new URL('../../assets/demo/oclc-bib-data.json', import.meta.url);
    bibDataPromise = globalThis.fetch(url).then(response => {
      if (!response.ok) throw new Error('The sample bibliographic records could not be loaded.');
      return response.json();
    });
  }
  return bibDataPromise;
}

function isDemoApiUrl(url) {
  try {
    return new URL(String(url), globalThis.location?.href || 'https://example.invalid/').pathname.endsWith(DEMO_API_PATH);
  } catch (_) {
    return false;
  }
}

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isAuthenticated(options = {}) {
  const headers = new Headers(options.headers || {});
  return headers.get('X-Query-Session') === DEMO_TOKEN;
}

function wildcardMatch(actual, expected) {
  const escaped = String(expected).replace(/[|\\{}()[\]^$+?.]/gu, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`, 'iu').test(String(actual ?? ''));
}

function matchesFilter(row, filter = {}) {
  const values = Array.isArray(row[filter.field]) ? row[filter.field] : [row[filter.field]];
  const expected = filter.value ?? '';
  const operator = filter.operator || '=';
  const matches = values.some(value => wildcardMatch(value, expected));
  if (operator === '!=') return !matches;
  if (operator === '>') return values.some(value => String(value) > String(expected));
  if (operator === '>=') return values.some(value => String(value) >= String(expected));
  if (operator === '<') return values.some(value => String(value) < String(expected));
  if (operator === '<=') return values.some(value => String(value) <= String(expected));
  return matches;
}

function runQuery(payload, data) {
  const fields = data.fields || [];
  const rows = (data.rows || []).map(values => Object.fromEntries(fields.map((field, index) => [field.name, values[index]])));
  const columns = payload.display_fields?.length ? payload.display_fields : data.defaultColumns;
  const limit = Math.max(1, Math.min(Number(payload.limit || payload.max_rows || rows.length), rows.length));
  const resultRows = rows.filter(row => (payload.filters || []).every(filter => matchesFilter(row, filter))).slice(0, limit);
  const queryId = `demo-${Date.now()}`;
  const events = [
    { type: 'meta', version: 1, format: 'jsonl', query_id: queryId, columns },
    ...resultRows.map(row => ({ type: 'row', values: columns.map(column => row[column] ?? '') })),
    { type: 'done', rows: resultRows.length }
  ];
  return new Response(`${events.map(event => JSON.stringify(event)).join('\n')}\n`, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Query-Id': queryId }
  });
}

function searchDemoBibs(payload, data) {
  const query = String(payload.query || '').trim().toLocaleLowerCase();
  const lookupType = payload.lookup_type || 'title';
  const limit = Math.max(1, Math.min(Number(payload.limit || 20), 25));
  const records = (data.records || []).filter(record => {
    const summary = record.local?.summary || {};
    if (lookupType === 'catalog_key') return String(summary.catalog_key || '') === query;
    if (lookupType === 'item_id') {
      return (record.item_ids || []).some(itemId => String(itemId).toLocaleLowerCase() === query);
    }
    if (lookupType === 'isbn') {
      const normalized = query.replace(/[\s-]+/gu, '');
      return (summary.isbn || []).some(isbn => String(isbn).replace(/[\s-]+/gu, '') === normalized);
    }
    return [
      summary.title,
      summary.creator,
      summary.isbn?.join(' ')
    ].some(value => String(value || '').toLocaleLowerCase().includes(query));
  }).slice(0, limit);

  return {
    lookup: { type: lookupType, query: payload.query || '' },
    results: records.map(record => structuredClone(record.local.summary)),
    returned: records.length,
    truncated: 0
  };
}

function resolveDemoBibsBulk(payload, data) {
  const results = (payload.entries || []).map((entry, index) => {
    const search = searchDemoBibs({ ...entry, limit: 10 }, data);
    if (search.results.length !== 1) {
      return {
        index,
        input: entry.query,
        lookup_type: entry.lookup_type,
        status: search.results.length ? 'review' : 'not_found',
        local_candidates: search.results,
        reason: search.results.length
          ? 'More than one local record matched this input.'
          : 'No local bibliographic record matched this input.'
      };
    }
    const comparison = compareDemoBib({
      catalog_key: search.results[0].catalog_key,
      target_tags: payload.target_tags
    }, data);
    return {
      index,
      input: entry.query,
      lookup_type: entry.lookup_type,
      status: comparison?.needs_selection ? 'review' : 'resolved',
      local: structuredClone(comparison.local.summary),
      ...(comparison?.worldcat ? {
        worldcat: structuredClone(comparison.worldcat.summary),
        selection: structuredClone(comparison.selection),
        match: structuredClone(comparison.match),
        review: structuredClone(comparison.review || {}),
        comparison_counts: structuredClone(comparison.comparison.counts)
      } : {
        candidates: structuredClone(comparison?.candidates || []),
        reason: 'No single strong WorldCat match was found.'
      })
    };
  });
  const counts = results.reduce((summary, result) => {
    summary[result.status] = (summary[result.status] || 0) + 1;
    return summary;
  }, { resolved: 0, review: 0, not_found: 0, failed: 0 });
  return { results, counts, returned: results.length };
}

function compareDemoBib(payload, data) {
  const record = (data.records || []).find(candidate => (
    String(candidate.local?.summary?.catalog_key || '') === String(payload.catalog_key || '')
  ));
  if (!record) return null;
  const requestedCandidate = payload.oclc_number
    ? (record.candidates || []).find(candidate => String(candidate.oclc_number || '') === String(payload.oclc_number))
    : null;
  if (payload.oclc_number && !requestedCandidate
      && String(payload.oclc_number) !== String(record.selection?.oclc_number || '')) {
    return null;
  }
  const comparison = structuredClone(record);
  if (requestedCandidate && String(requestedCandidate.oclc_number) !== String(comparison.selection?.oclc_number || '')) {
    comparison.selection = {
      oclc_number: String(requestedCandidate.oclc_number),
      method: 'staff_selection'
    };
    comparison.worldcat.summary = {
      ...comparison.worldcat.summary,
      ...structuredClone(requestedCandidate),
      publication: requestedCandidate.date || comparison.worldcat.summary.publication
    };
    comparison.match = {
      confidence: requestedCandidate.match_confidence || 'possible',
      reason: requestedCandidate.match_reason || 'This candidate needs staff review.',
      hydration_ready: requestedCandidate.validation_rejected ? 0 : 1,
      identity_conflict: requestedCandidate.validation_rejected ? 1 : 0
    };
    comparison.review = {
      ...comparison.review,
      identity_score: requestedCandidate.match_score,
      overall_score: requestedCandidate.match_score,
      confidence_band: requestedCandidate.match_confidence_band || 'review',
      advice: requestedCandidate.validation_rejected ? 'do_not_hydrate' : 'review',
      reason: requestedCandidate.match_reason || 'This candidate needs staff review.'
    };
  }
  const requestedTags = [...new Set((payload.target_tags || []).map(String))];
  const worldcatTags = new Set([
    ...(comparison.worldcat?.record?.fields || []).map(field => field.tag),
    ...(comparison.comparison?.rows || []).filter(row => row.worldcat).map(row => row.tag)
  ]);
  const blocked = requestedTags.filter(tag => /^(?:001|003|005|035|040|049|59\d|69\d|8[5-9]\d|9\d\d)$/u.test(tag));
  const missing = requestedTags.filter(tag => !worldcatTags.has(tag));
  const fields = requestedTags.map(tag => ({
    tag,
    available: worldcatTags.has(tag) ? 1 : 0,
    hydration_allowed: worldcatTags.has(tag) && !blocked.includes(tag) ? 1 : 0,
    risk: blocked.includes(tag) ? 'blocked' : (['250', '264', '300', '505', '520', '521', '526', '856'].includes(tag) ? 'high' : 'standard')
  }));
  const targetScore = requestedTags.length
    ? Math.round(100 * fields.filter(field => field.hydration_allowed).length / requestedTags.length)
    : 100;
  const identityScore = Number(comparison.review?.identity_score) || 98;
  const identityRejected = Boolean(comparison.match?.identity_conflict || !comparison.match?.hydration_ready);
  const advice = identityRejected
    ? 'do_not_hydrate'
    : blocked.length
    ? 'do_not_hydrate'
    : (missing.length ? 'review' : 'recommended');
  const evidenceFields = fields.map(field => {
    const status = !field.hydration_allowed
      ? 'not_appropriate'
      : (['521', '526'].includes(field.tag) ? 'strong' : 'supported');
    return {
      tag: field.tag,
      label: field.tag === '521' ? 'Target audience note' : (field.tag === '526' ? 'Study program information' : `Field ${field.tag}`),
      status,
      reason: status === 'strong'
        ? 'The field is structurally valid, attributed, and attached to an identity-safe WorldCat record.'
        : (status === 'supported'
            ? 'The field is structurally valid and attached to an identity-safe WorldCat record.'
            : 'This field is missing or is not eligible for WorldCat hydration.'),
      download_allowed: ['strong', 'supported'].includes(status) ? 1 : 0,
      local_count: 0,
      worldcat_count: field.available ? 1 : 0,
      local_relationship: 'missing_locally',
      source_path: 'local_035',
      source_path_label: 'Existing local OCLC link',
      field_attribution: field.tag === '526' ? ['Accelerated Reader AR'] : [],
      structure: { valid: field.available ? 1 : 0, issues: [] }
    };
  });
  comparison.review = {
    ...(comparison.review || {}),
    mode: requestedTags.length ? 'selected_fields' : 'all_fields',
    requested_tags: requestedTags,
    identity_score: identityScore,
    target_field_score: targetScore,
    overall_score: requestedTags.length
      ? Math.min(identityScore, Math.round((identityScore * 0.8) + (targetScore * 0.2)))
      : identityScore,
    confidence_band: comparison.review?.confidence_band || 'high',
    advice,
    reason: identityRejected
      ? (comparison.review?.reason || 'Record identity does not meet the minimum safe hydration threshold.')
      : advice === 'recommended'
      ? 'The record identity and requested-field coverage meet the hydration thresholds.'
      : (advice === 'do_not_hydrate'
          ? 'One or more requested fields are local or control fields that should not be copied from WorldCat.'
          : 'The selected WorldCat record does not contain every requested field.'),
    recommended: advice === 'recommended' ? 1 : 0,
    identity_threshold: requestedTags.some(tag => fields.find(field => field.tag === tag)?.risk === 'high') ? 90 : 80,
    overall_threshold: 80,
    fields,
    missing_tags: missing,
    blocked_tags: blocked,
    high_risk_tags: fields.filter(field => field.risk === 'high').map(field => field.tag),
    field_evidence: {
      applicable: evidenceFields.length ? 1 : 0,
      ready_for_candidate_download: evidenceFields.length && evidenceFields.every(field => field.download_allowed) ? 1 : 0,
      score_effect: 'none',
      version: '1.0-demo',
      fields: evidenceFields,
      needs_review_tags: [],
      conflicting_tags: [],
      not_appropriate_tags: evidenceFields.filter(field => field.status === 'not_appropriate').map(field => field.tag),
      already_present_tags: [],
      record_provenance: {
        cataloging_agencies: ['DLC', 'OCLCO'],
        authentication_codes: ['pcc']
      }
    },
    scoring_version: '1.0-demo'
  };
  return comparison;
}

async function handleDemoQueryRequest(options = {}) {
  let payload = {};
  try { payload = JSON.parse(String(options.body || '{}')); } catch (_) { return json({ error: 'Invalid JSON request.' }, 400); }

  if (payload.action === 'login') {
    return payload.username === 'demo' && payload.password === 'library'
      ? json({ token: DEMO_TOKEN, username: 'demo', role: 'demo', demo: true })
      : json({ error: 'Invalid username or password.' }, 401);
  }
  if (payload.action === 'whoami') {
    return json(isAuthenticated(options)
      ? { authenticated: true, username: 'demo', role: 'demo', demo: true }
      : { authenticated: false, username: null, role: 'public' });
  }
  if (!isAuthenticated(options)) return json({ error: 'Sign in with the demo account to continue.' }, 403);

  const data = await loadDemoData();
  switch (payload.action) {
    case 'logout': return json({ status: 'signed_out' });
    case 'change_password': return json({ error: 'The shared demo password cannot be changed.' }, 403);
    case 'get_fields': return json({ fields: data.fields || [] });
    case 'run': return runQuery(payload, data);
    case 'status': return json({ queries: Object.fromEntries([...demoHydrationRuns].map(([id, run]) => [id, run.metadata])) });
    case 'list': return json({ queries: [] });
    case 'list_templates': return json({ categories: [], templates: [] });
    case 'search_bibs': {
      const bibData = await loadDemoBibData();
      return json(searchDemoBibs(payload, bibData));
    }
    case 'compare_oclc_bib': {
      const bibData = await loadDemoBibData();
      const comparison = compareDemoBib(payload, bibData);
      return comparison
        ? json(comparison)
        : json({ error: 'The sample bibliographic record was not found.' }, 404);
    }
    case 'resolve_oclc_bibs_bulk': {
      const bibData = await loadDemoBibData();
      const resolved = resolveDemoBibsBulk(payload, bibData);
      const run = demoHydrationRuns.get(payload.run_id);
      if (run && payload.batch_id && !run.batches.has(payload.batch_id)) {
        run.batches.add(payload.batch_id);
        run.results.push(...structuredClone(resolved.results));
        run.metadata.hydration_completed = run.results.length;
        run.metadata.row_count = run.results.length;
      }
      return json(resolved);
    }
    case 'start_hydration_run': {
      const runId = `query_${Math.floor(Date.now() / 1000)}_${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
      const metadata = {
        kind: 'hydration', created_by: 'demo', name: payload.name,
        status: 'hydration_running', start_time: new Date().toISOString(),
        hydration_total: payload.total, hydration_completed: 0, row_count: 0,
        target_tags: payload.target_tags || []
      };
      demoHydrationRuns.set(runId, { metadata, results: [], batches: new Set() });
      return json({ run_id: runId, metadata });
    }
    case 'get_hydration_run': {
      const run = demoHydrationRuns.get(payload.run_id);
      if (!run) return json({ error: 'Hydration run not found.' }, 404);
      const offset = Number(payload.offset || 0);
      const limit = Number(payload.limit || 500);
      const results = run.results.slice(offset, offset + limit);
      return json({
        run_id: payload.run_id, metadata: run.metadata, results, offset,
        next_offset: offset + results.length, total: run.results.length,
        has_more: offset + results.length < run.results.length
      });
    }
    case 'finish_hydration_run': {
      const run = demoHydrationRuns.get(payload.run_id);
      if (!run) return json({ error: 'Hydration run not found.' }, 404);
      run.metadata.status = payload.status;
      run.metadata.end_time = new Date().toISOString();
      return json({ run_id: payload.run_id, metadata: run.metadata });
    }
    case 'update_history_run': {
      const run = demoHydrationRuns.get(payload.query_id);
      if (!run) return json({ error: 'History run not found.' }, 404);
      if (typeof payload.name === 'string' && payload.name.trim()) run.metadata.name = payload.name.trim();
      if (typeof payload.pinned === 'boolean') run.metadata.pinned = payload.pinned;
      return json({
        query_id: payload.query_id,
        name: run.metadata.name,
        pinned: Boolean(run.metadata.pinned)
      });
    }
    case 'cancel': return json({ ok: true });
    case 'get_results': return json({ error: 'No saved demo result was found.' }, 404);
    default: return json({ error: `The demo backend does not support ${payload.action || 'this action'}.` }, 400);
  }
}

async function queryFetch(url, options = {}) {
  return isDemoApiUrl(url) ? handleDemoQueryRequest(options) : globalThis.fetch(url, options);
}

export { DEMO_API_PATH, handleDemoQueryRequest, isDemoApiUrl, queryFetch };
