const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'million', 'billion', 'trillion',
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth',
  'eighteenth', 'nineteenth', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth',
  'seventieth', 'eightieth', 'ninetieth', 'hundredth', 'thousandth', 'millionth',
  'billionth', 'trillionth'
];

const NUMBER_MARKER_PATTERN = new RegExp(
  `(?:\\b\\d+(?:st|nd|rd|th)?\\b|\\b(?:${NUMBER_WORDS.join('|')})(?:[-\\s](?:${NUMBER_WORDS.join('|')}))?\\b)`,
  'iu'
);
const ROMAN_NUMERAL_MARKER_PATTERN = /(?:^|[\s(:;,\-])(?:II|III|IV|VI|VII|VIII|IX|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX)(?!\.[a-z])(?=$|[\s).:;,\-])|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]/iu;
const CONTEXTUAL_SINGLE_ROMAN_PATTERN = /\b(?:book|volume|vol\.?|part|episode|chapter|act|scene|section|phase|series|war)\s+[VX](?=$|[\s).:;,\-])/iu;
const ALPHABETIC_SERIES_PATTERN = /^\s*(?:[a-z]\s+is\s+for\b|x\s*(?:$|[/:\-–—]\s*))/iu;

function getSequenceMarkerCandidateText(value) {
  return String(value || '').split(/\s+\/\s*/u, 1)[0];
}

function hasNumberSequenceMarker(value) {
  return NUMBER_MARKER_PATTERN.test(getSequenceMarkerCandidateText(value));
}

function hasRomanNumeralSequenceMarker(value) {
  const candidate = getSequenceMarkerCandidateText(value);
  return ROMAN_NUMERAL_MARKER_PATTERN.test(candidate) || CONTEXTUAL_SINGLE_ROMAN_PATTERN.test(candidate);
}

function hasAlphabeticSequenceMarker(value) {
  return ALPHABETIC_SERIES_PATTERN.test(getSequenceMarkerCandidateText(value));
}

export {
  hasAlphabeticSequenceMarker,
  hasNumberSequenceMarker,
  hasRomanNumeralSequenceMarker
};
