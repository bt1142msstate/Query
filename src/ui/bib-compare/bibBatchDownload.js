import { postJson } from '../../core/backendApi.js';
import { recordToMarc, recordToMarcxml } from './bibRecordDownload.js';

const DOWNLOAD_CHUNK_SIZE = 25;

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach(part => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function recordsToMarc(records) {
  return concatBytes((records || []).map(recordToMarc));
}

function recordsToMarcxml(records) {
  const bodies = (records || []).map(record => recordToMarcxml(record)
    .replace(/^<\?xml[^>]*>\s*/u, '')
    .replace('<record xmlns="http://www.loc.gov/MARC21/slim">', '<record>')
    .trim());
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<collection xmlns="http://www.loc.gov/MARC21/slim">',
    ...bodies.map(body => body.split('\n').map(line => `  ${line}`).join('\n')),
    '</collection>',
    ''
  ].join('\n');
}

function downloadableExternalRequests(results) {
  const seen = new Set();
  const requests = [];
  for (const result of results || []) {
    if (result.status !== 'resolved' || result.review?.advice !== 'recommended') continue;
    const source = result.selection?.source === 'loc' || result.source?.code === 'loc' ? 'loc' : 'oclc';
    const identifier = source === 'loc' ? result.selection?.lccn : result.selection?.oclc_number;
    const key = `${source}:${identifier || ''}`;
    if (!identifier || seen.has(key)) continue;
    seen.add(key);
    requests.push({ source, identifier: String(identifier) });
  }
  return requests;
}

async function retrieveBatchBibRecords(results, { onProgress } = {}) {
  const requests = downloadableExternalRequests(results);
  const records = [];
  const failures = [];
  for (let offset = 0; offset < requests.length; offset += DOWNLOAD_CHUNK_SIZE) {
    const chunk = requests.slice(offset, offset + DOWNLOAD_CHUNK_SIZE);
    const { data } = await postJson({ action: 'retrieve_external_bibs_bulk', records: chunk }, { timeoutMs: 600000 });
    for (const result of data.records || []) {
      if (result.status === 'resolved' && result.record) records.push(result.record);
      else failures.push(result);
    }
    onProgress?.({ completed: Math.min(offset + chunk.length, requests.length), total: requests.length });
  }
  return { records, failures, requested: requests.length };
}

function downloadBatchBibRecords(records, format = 'marc') {
  if (!records?.length) throw new Error('No recommended external records are available to download.');
  const marcxml = format === 'marcxml';
  const blob = new Blob(
    [marcxml ? recordsToMarcxml(records) : recordsToMarc(records)],
    { type: marcxml ? 'application/marcxml+xml;charset=utf-8' : 'application/marc' }
  );
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `hydration-matched-records.${marcxml ? 'xml' : 'mrc'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return link.download;
}

export {
  downloadableExternalRequests,
  downloadBatchBibRecords,
  recordsToMarc,
  recordsToMarcxml,
  retrieveBatchBibRecords
};
