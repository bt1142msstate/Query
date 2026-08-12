import assert from 'node:assert/strict';
import test from 'node:test';

import {
  downloadableExternalRequests,
  recordsToMarc,
  recordsToMarcxml
} from '../../../src/ui/bib-compare/bibBatchDownload.js';

const record = number => ({
  leader: '00000nam a2200000 i 4500',
  fields: [
    { tag: '001', control: 1, data: number },
    { tag: '245', control: 0, indicator1: '0', indicator2: '0', subfields: [{ code: 'a', value: `Title ${number}` }] }
  ]
});

test('batch download includes only unique recommended matches', () => {
  const requests = downloadableExternalRequests([
    { status: 'resolved', review: { advice: 'recommended' }, selection: { source: 'oclc', oclc_number: '111' } },
    { status: 'resolved', review: { advice: 'review' }, selection: { source: 'oclc', oclc_number: '222' } },
    { status: 'resolved', review: { advice: 'recommended' }, selection: { source: 'oclc', oclc_number: '111' } },
    { status: 'resolved', review: { advice: 'recommended' }, selection: { source: 'loc', lccn: '2004012345' } }
  ]);
  assert.deepEqual(requests, [
    { source: 'oclc', identifier: '111' },
    { source: 'loc', identifier: '2004012345' }
  ]);
});

test('batch MARC and MARCXML serializers contain every selected record', () => {
  const records = [record('111'), record('222')];
  const marc = recordsToMarc(records);
  assert.equal([...marc].filter(byte => byte === 0x1d).length, 2);
  const xml = recordsToMarcxml(records);
  assert.equal((xml.match(/<record>/gu) || []).length, 2);
  assert.match(xml, /<collection xmlns="http:\/\/www\.loc\.gov\/MARC21\/slim">/u);
  assert.match(xml, /Title 111/u);
  assert.match(xml, /Title 222/u);
});
