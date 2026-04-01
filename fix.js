const fs = require('fs');
let file = fs.readFileSync('/Users/brandont/Documents/Sirsi Query Project/Query Website/core/queryTemplates.js', 'utf8');

const target = `        if (options.requireQuery && !hasUsableCurrentQuery()) {
          validationErrors.push('Build a query with at least one column or filter before saving a template.');
        }

        return validationErrors;
      if (!trimmedName) {`;

const repl = `      if (options.requireQuery && !hasUsableCurrentQuery()) {
        validationErrors.push('Build a query with at least one column or filter before saving a template.');
      }

      return validationErrors;
    }

    function validateCategoryName(name, options = {}) {
      const trimmedName = String(name || '').trim();
      if (!trimmedName) {`;

file = file.replace(target, repl);
fs.writeFileSync('/Users/brandont/Documents/Sirsi Query Project/Query Website/core/queryTemplates.js', file);
