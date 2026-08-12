function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function summaryRow(label, value, summarize) {
  const row = createElement('div', 'bib-compare-summary-row');
  row.append(
    createElement('dt', '', label),
    createElement('dd', '', summarize(value))
  );
  return row;
}

export { createElement, summaryRow };
