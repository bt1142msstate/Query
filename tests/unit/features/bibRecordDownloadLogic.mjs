import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBibDownloadFilename,
  buildHydratedBibRecord,
  recordToMarc,
  recordToMarcxml,
  recordToMrk,
  serializeBibRecord
} from '../../../src/ui/bib-compare/bibRecordDownload.js';

const record = {
  leader: '00000cam a2200000 a 4500',
  fields: [
    { tag: '001', control: 1, data: 'ocm54005706' },
    {
      tag: '245',
      control: 0,
      indicator1: '1',
      indicator2: '0',
      subfields: [
        { code: 'a', value: 'A hat full of sky /' },
        { code: 'c', value: 'Terry Pratchett.' }
      ]
    },
    {
      tag: '500',
      control: 0,
      indicator1: ' ',
      indicator2: ' ',
      subfields: [{ code: 'a', value: 'Includes “smart” punctuation & symbols.' }]
    }
  ]
};

test('MARCXML export escapes XML while preserving Unicode text', () => {
  const xml = recordToMarcxml(record);
  assert.match(xml, /xmlns="http:\/\/www\.loc\.gov\/MARC21\/slim"/u);
  assert.match(xml, /<controlfield tag="001">ocm54005706<\/controlfield>/u);
  assert.match(xml, /Includes “smart” punctuation &amp; symbols\./u);
});

test('readable MARC export uses mnemonic fields and visible blank indicators', () => {
  const mrk = recordToMrk(record);
  assert.match(mrk, /^=LDR  /u);
  assert.ok(mrk.includes('=245  10$aA hat full of sky /$cTerry Pratchett.'));
  assert.ok(mrk.includes('=500  \\\\$aIncludes “smart” punctuation & symbols.'));
});

test('binary MARC export builds a valid ISO 2709 envelope', () => {
  const bytes = recordToMarc(record);
  const recordLength = Number(new TextDecoder().decode(bytes.slice(0, 5)));
  const baseAddress = Number(new TextDecoder().decode(bytes.slice(12, 17)));
  assert.equal(recordLength, bytes.length);
  assert.equal(bytes[bytes.length - 1], 0x1d);
  assert.equal(bytes[baseAddress - 1], 0x1e);
  assert.equal(new TextDecoder().decode(bytes.slice(9, 12)), 'a22');
  assert.equal(new TextDecoder().decode(bytes.slice(24, 27)), '001');
});

test('download filenames identify source, record number, title, and format', () => {
  assert.equal(buildBibDownloadFilename({
    source: 'local',
    summary: { catalog_key: '923278', title: 'A hat full of sky /' },
    format: 'marc'
  }), 'symphony-catalog-923278-a-hat-full-of-sky.mrc');
  assert.equal(buildBibDownloadFilename({
    source: 'worldcat',
    summary: { oclc_number: '54005706', title: 'A hat full of sky /' },
    format: 'marcxml'
  }), 'worldcat-oclc-54005706-a-hat-full-of-sky.xml');
  assert.equal(buildBibDownloadFilename({
    source: 'hydrated',
    summary: { catalog_key: '923278', title: 'A hat full of sky /' },
    format: 'marc'
  }), 'hydrated-catalog-923278-a-hat-full-of-sky.mrc');
});

test('hydration candidate replaces only requested fields and preserves local control data', () => {
  const localRecord = {
    ...record,
    fields: [
      ...record.fields,
      { tag: '526', control: 0, indicator1: '0', indicator2: ' ', subfields: [{ code: 'a', value: 'Old local value' }] },
      { tag: '590', control: 0, indicator1: ' ', indicator2: ' ', subfields: [{ code: 'a', value: 'Local note' }] }
    ]
  };
  const worldcatRecord = {
    ...record,
    fields: [
      ...record.fields,
      { tag: '521', control: 0, indicator1: '8', indicator2: ' ', subfields: [{ code: 'a', value: 'Lexile 680L.' }] },
      { tag: '526', control: 0, indicator1: '0', indicator2: ' ', subfields: [{ code: 'a', value: 'Accelerated Reader' }] },
      { tag: '650', control: 0, indicator1: ' ', indicator2: '0', subfields: [{ code: 'a', value: 'Fantasy fiction.' }] }
    ]
  };
  const hydrated = buildHydratedBibRecord({ localRecord, worldcatRecord, tags: ['521', '526'] });
  assert.equal(hydrated.fields.find(field => field.tag === '001').data, 'ocm54005706');
  assert.equal(hydrated.fields.find(field => field.tag === '526').subfields[0].value, 'Accelerated Reader');
  assert.equal(hydrated.fields.filter(field => field.tag === '521').length, 1);
  assert.equal(hydrated.fields.filter(field => field.tag === '650').length, 0);
  assert.equal(hydrated.fields.find(field => field.tag === '590').subfields[0].value, 'Local note');
  assert.equal(localRecord.fields.find(field => field.tag === '526').subfields[0].value, 'Old local value');
});

test('hydration candidate rejects control fields and missing requested data', () => {
  assert.throws(() => buildHydratedBibRecord({
    localRecord: record,
    worldcatRecord: record,
    tags: ['001']
  }), /Protected field 001/u);
  assert.throws(() => buildHydratedBibRecord({
    localRecord: record,
    worldcatRecord: record,
    tags: ['526']
  }), /does not contain the selected field/u);
});

test('JSON export contains the selected source and full record', () => {
  const json = JSON.parse(serializeBibRecord({
    source: 'worldcat',
    summary: { oclc_number: '54005706', title: 'A hat full of sky /' },
    record,
    format: 'json'
  }));
  assert.equal(json.source, 'OCLC WorldCat');
  assert.equal(json.summary.oclc_number, '54005706');
  assert.equal(json.record.fields.length, 3);
});
