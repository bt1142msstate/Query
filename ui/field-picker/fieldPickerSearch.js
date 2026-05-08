function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getOptionCategories(option) {
  return String(option?.category || '')
    .split(',')
    .map(category => category.trim())
    .filter(Boolean);
}

function fieldPickerOptionMatchesCategory(option, selectedCategory = '') {
  const category = String(selectedCategory || '').trim();
  return !category || getOptionCategories(option).includes(category);
}

function getWordStartMatchRank(text, searchTerm) {
  const words = text.split(/[^a-z0-9]+/u).filter(Boolean);
  return words.some(word => word.startsWith(searchTerm)) ? 2 : null;
}

function getFieldPickerSearchRank(option, searchTerm) {
  const normalizedSearchTerm = normalizeSearchText(searchTerm);
  if (!normalizedSearchTerm) {
    return 0;
  }

  const name = normalizeSearchText(option?.name);
  const category = normalizeSearchText(option?.category);
  const type = normalizeSearchText(option?.type);
  const desc = normalizeSearchText(option?.desc);
  const description = normalizeSearchText(option?.description);

  if (name === normalizedSearchTerm) return 0;
  if (name.startsWith(normalizedSearchTerm)) return 1;

  const wordStartRank = getWordStartMatchRank(name, normalizedSearchTerm);
  if (wordStartRank !== null) return wordStartRank;

  if (name.includes(normalizedSearchTerm)) return 3;
  if (category.includes(normalizedSearchTerm)) return 4;
  if (type.includes(normalizedSearchTerm)) return 5;
  if (desc.includes(normalizedSearchTerm) || description.includes(normalizedSearchTerm)) return 6;

  return null;
}

function getRankedFieldPickerOptions(options = [], { searchTerm = '', selectedCategory = '' } = {}) {
  const categoryFilteredOptions = (Array.isArray(options) ? options : [])
    .filter(option => fieldPickerOptionMatchesCategory(option, selectedCategory));
  const normalizedSearchTerm = normalizeSearchText(searchTerm);

  if (!normalizedSearchTerm) {
    return categoryFilteredOptions;
  }

  return categoryFilteredOptions
    .map((option, index) => ({
      index,
      option,
      rank: getFieldPickerSearchRank(option, normalizedSearchTerm)
    }))
    .filter(entry => entry.rank !== null)
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      const nameComparison = String(left.option?.name || '').localeCompare(
        String(right.option?.name || ''),
        undefined,
        { numeric: true, sensitivity: 'base' }
      );
      return nameComparison || left.index - right.index;
    })
    .map(entry => entry.option);
}

export {
  getFieldPickerSearchRank,
  getRankedFieldPickerOptions
};
