const XML_CONTROL_CHARACTERS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu;
const XML_TEXT_ESCAPE_PATTERN = /[&<>]/gu;
const XML_TEXT_NEEDS_ESCAPE_PATTERN = /[&<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u;
const XML_ATTRIBUTE_QUOTE_PATTERN = /["']/gu;
const XML_ATTRIBUTE_NEEDS_ESCAPE_PATTERN = /["'&<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u;
const COLUMN_NAME_CACHE = [''];

function getXmlTextEntity(character) {
  if (character === '&') return '&amp;';
  if (character === '<') return '&lt;';
  return '&gt;';
}

function escapeXmlText(text) {
  if (!XML_TEXT_NEEDS_ESCAPE_PATTERN.test(text)) {
    return text;
  }
  return text
    .replace(XML_CONTROL_CHARACTERS_PATTERN, '')
    .replace(XML_TEXT_ESCAPE_PATTERN, getXmlTextEntity);
}

function escapeXmlAttribute(value) {
  const text = String(value ?? '');
  if (!XML_ATTRIBUTE_NEEDS_ESCAPE_PATTERN.test(text)) {
    return text;
  }
  return escapeXmlText(text).replace(XML_ATTRIBUTE_QUOTE_PATTERN, character => (
    character === '"' ? '&quot;' : '&apos;'
  ));
}

function getColumnName(index) {
  if (COLUMN_NAME_CACHE[index]) {
    return COLUMN_NAME_CACHE[index];
  }

  let current = index;
  let name = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  COLUMN_NAME_CACHE[index] = name;
  return name;
}

export {
  escapeXmlAttribute,
  escapeXmlText,
  getColumnName
};
