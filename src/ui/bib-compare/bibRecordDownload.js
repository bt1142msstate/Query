const MARC_ACRONYM = ['M', 'A', 'R', 'C'].join('');

const FORMATS = Object.freeze({
  marc: {
    extension: 'mrc',
    label: `${MARC_ACRONYM} record (.mrc)`,
    mimeType: 'application/marc'
  },
  marcxml: {
    extension: 'xml',
    label: `${MARC_ACRONYM}XML (.xml)`,
    mimeType: 'application/marcxml+xml;charset=utf-8'
  },
  mrk: {
    extension: 'mrk',
    label: 'Readable MARC (.mrk)',
    mimeType: 'text/plain;charset=utf-8'
  },
  json: {
    extension: 'json',
    label: 'JSON (.json)',
    mimeType: 'application/json;charset=utf-8'
  }
});

const encoder = new TextEncoder();

function safeText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ' ')
    .replace(/\r\n?/gu, '\n');
}

function normalizedRecord(record) {
  const fields = Array.isArray(record?.fields)
    ? record.fields.filter(field => /^\d{3}$/u.test(String(field?.tag || '')))
    : [];
  return {
    leader: safeText(record?.leader).padEnd(24, ' ').slice(0, 24),
    fields
  };
}

function cloneField(field) {
  return {
    ...field,
    ...(Array.isArray(field?.subfields)
      ? { subfields: field.subfields.map(subfield => ({ ...subfield })) }
      : {})
  };
}

function isProtectedHydrationTag(tag) {
  const number = Number(tag);
  return number < 10
    || ['035', '040', '049'].includes(tag)
    || (number >= 590 && number <= 599)
    || (number >= 690 && number <= 699)
    || (number >= 850 && number <= 899)
    || number >= 900;
}

function buildHydratedBibRecord({ localRecord, worldcatRecord, tags }) {
  const local = normalizedRecord(localRecord);
  const worldcat = normalizedRecord(worldcatRecord);
  const requestedTags = [...new Set((tags || []).map(tag => String(tag || '').trim()))]
    .filter(tag => /^\d{3}$/u.test(tag));
  if (!local.fields.length || !worldcat.fields.length) {
    throw new Error('Both complete bibliographic records are required to build a hydration candidate.');
  }
  if (!requestedTags.length) {
    throw new Error('Choose specific eligible fields before downloading a hydration candidate.');
  }
  const blockedTag = requestedTags.find(isProtectedHydrationTag);
  if (blockedTag) {
    throw new Error(`Protected field ${blockedTag} cannot be hydrated.`);
  }

  const selectedFields = worldcat.fields
    .filter(field => requestedTags.includes(String(field.tag)) && !field.control)
    .map(cloneField);
  const availableTags = new Set(selectedFields.map(field => String(field.tag)));
  const missingTags = requestedTags.filter(tag => !availableTags.has(tag));
  if (missingTags.length) {
    throw new Error(`The external record does not contain the selected field${missingTags.length === 1 ? '' : 's'}: ${missingTags.join(', ')}.`);
  }

  const outputFields = local.fields
    .filter(field => !availableTags.has(String(field.tag)))
    .map(cloneField);
  selectedFields.forEach(field => {
    const tagNumber = Number(field.tag);
    const insertAt = outputFields.findIndex(existing => Number(existing.tag) > tagNumber);
    if (insertAt < 0) outputFields.push(field);
    else outputFields.splice(insertAt, 0, field);
  });
  return { leader: local.leader, fields: outputFields };
}

function xmlEscape(value) {
  return safeText(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

function marcxmlField(field) {
  const tag = String(field.tag);
  if (field.control) {
    return `    <controlfield tag="${tag}">${xmlEscape(field.data)}</controlfield>`;
  }
  const ind1 = xmlEscape(safeText(field.indicator1).slice(0, 1) || ' ');
  const ind2 = xmlEscape(safeText(field.indicator2).slice(0, 1) || ' ');
  const subfields = (Array.isArray(field.subfields) ? field.subfields : [])
    .filter(subfield => /^[0-9A-Za-z]$/u.test(String(subfield?.code || '')))
    .map(subfield => `      <subfield code="${xmlEscape(String(subfield.code).slice(0, 1))}">${xmlEscape(subfield.value)}</subfield>`)
    .join('\n');
  return [
    `    <datafield tag="${tag}" ind1="${ind1}" ind2="${ind2}">`,
    subfields,
    '    </datafield>'
  ].filter(Boolean).join('\n');
}

function recordToMarcxml(record) {
  const normalized = normalizedRecord(record);
  const fields = normalized.fields.map(marcxmlField).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<record xmlns="http://www.loc.gov/MARC21/slim">',
    `  <leader>${xmlEscape(normalized.leader)}</leader>`,
    fields,
    '</record>',
    ''
  ].join('\n');
}

function mrkText(value) {
  return safeText(value).replace(/\n+/gu, ' ');
}

function recordToMrk(record) {
  const normalized = normalizedRecord(record);
  const lines = [`=LDR  ${mrkText(normalized.leader)}`];
  normalized.fields.forEach(field => {
    if (field.control) {
      lines.push(`=${field.tag}  ${mrkText(field.data)}`);
      return;
    }
    const indicators = [field.indicator1, field.indicator2]
      .map(value => (safeText(value).slice(0, 1) || ' ') === ' ' ? '\\' : safeText(value).slice(0, 1))
      .join('');
    const subfields = (Array.isArray(field.subfields) ? field.subfields : [])
      .filter(subfield => /^[0-9A-Za-z]$/u.test(String(subfield?.code || '')))
      .map(subfield => `$${String(subfield.code).slice(0, 1)}${mrkText(subfield.value)}`)
      .join('');
    lines.push(`=${field.tag}  ${indicators}${subfields}`);
  });
  return `${lines.join('\n')}\n`;
}

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

function recordToMarc(record) {
  const normalized = normalizedRecord(record);
  const directory = [];
  const fieldBytes = [];
  let fieldOffset = 0;

  normalized.fields.forEach(field => {
    let content;
    if (field.control) {
      content = encoder.encode(safeText(field.data));
    } else {
      const indicators = `${safeText(field.indicator1).slice(0, 1) || ' '}${safeText(field.indicator2).slice(0, 1) || ' '}`;
      const pieces = [encoder.encode(indicators)];
      (Array.isArray(field.subfields) ? field.subfields : [])
        .filter(subfield => /^[0-9A-Za-z]$/u.test(String(subfield?.code || '')))
        .forEach(subfield => {
          pieces.push(Uint8Array.of(0x1f));
          pieces.push(encoder.encode(`${String(subfield.code).slice(0, 1)}${safeText(subfield.value)}`));
        });
      content = concatBytes(pieces);
    }

    const completeField = concatBytes([content, Uint8Array.of(0x1e)]);
    if (completeField.length > 9999 || fieldOffset > 99999) {
      throw new Error('This record is too large for ISO 2709 MARC download.');
    }
    directory.push(`${field.tag}${String(completeField.length).padStart(4, '0')}${String(fieldOffset).padStart(5, '0')}`);
    fieldBytes.push(completeField);
    fieldOffset += completeField.length;
  });

  const directoryBytes = encoder.encode(directory.join(''));
  const baseAddress = 24 + directoryBytes.length + 1;
  const recordLength = baseAddress + fieldOffset + 1;
  if (recordLength > 99999) {
    throw new Error('This record is too large for ISO 2709 MARC download.');
  }

  const leader = normalized.leader.split('');
  String(recordLength).padStart(5, '0').split('').forEach((character, index) => { leader[index] = character; });
  leader[9] = 'a';
  leader[10] = '2';
  leader[11] = '2';
  String(baseAddress).padStart(5, '0').split('').forEach((character, index) => { leader[12 + index] = character; });
  '4500'.split('').forEach((character, index) => { leader[20 + index] = character; });

  return concatBytes([
    encoder.encode(leader.join('')),
    directoryBytes,
    Uint8Array.of(0x1e),
    ...fieldBytes,
    Uint8Array.of(0x1d)
  ]);
}

function filenamePart(value, fallback) {
  const normalized = safeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 56);
  return normalized || fallback;
}

function buildBibDownloadFilename({ source, summary, format }) {
  const sourceName = source === 'loc' ? 'library-of-congress' : (source === 'worldcat' ? 'worldcat' : (source === 'hydrated' ? 'hydrated' : 'symphony'));
  const identifier = source === 'loc'
    ? `lccn-${filenamePart(Array.isArray(summary?.lccn) ? summary.lccn[0] : summary?.lccn, 'record')}`
    : (source === 'worldcat'
        ? `oclc-${filenamePart(summary?.oclc_number, 'record')}`
        : `catalog-${filenamePart(summary?.catalog_key, 'record')}`);
  const title = filenamePart(summary?.title, 'untitled');
  return `${sourceName}-${identifier}-${title}.${FORMATS[format]?.extension || 'json'}`;
}

function serializeBibRecord({ record, summary, source, format }) {
  if (!record || !Array.isArray(record.fields)) {
    throw new Error('The complete bibliographic record is not available.');
  }
  switch (format) {
    case 'marc':
      return recordToMarc(record);
    case 'marcxml':
      return recordToMarcxml(record);
    case 'mrk':
      return recordToMrk(record);
    case 'json':
      return `${JSON.stringify({
      source: source === 'loc'
        ? 'Library of Congress'
        : (source === 'worldcat'
            ? 'OCLC WorldCat'
            : (source === 'hydrated' ? 'Hydration candidate' : 'Symphony')),
        summary: summary || {},
        record: normalizedRecord(record)
      }, null, 2)}\n`;
    default:
      throw new Error('Choose a supported bibliographic record format.');
  }
}

function downloadBibRecord(options) {
  const format = FORMATS[options?.format] ? options.format : 'marc';
  const content = serializeBibRecord({ ...options, format });
  const blob = new Blob([content], { type: FORMATS[format].mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildBibDownloadFilename({ ...options, format });
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return link.download;
}

export {
  FORMATS,
  buildBibDownloadFilename,
  buildHydratedBibRecord,
  downloadBibRecord,
  recordToMarc,
  recordToMarcxml,
  recordToMrk,
  serializeBibRecord
};
