import { DOM } from '../core/domCache.js';
import {
  getAvailableCategories,
  hasLoadedFieldDefinitions
} from '../core/fieldDefs.js';

function getSelectorTooltip(categoryName) {
  switch (categoryName) {
    case 'All':
      return 'Show all available fields';
    case 'Selected':
      return 'Show fields currently in use (displayed or filtered)';
    default:
      return `Show fields grouped under ${categoryName}`;
  }
}

function renderDesktopCategorySelectors(categoryBar, categories, categoryCounts, currentCategory, onCategoryChange) {
  categoryBar.innerHTML = categories.map(categoryName => {
    if (categoryName === 'Selected' && categoryCounts.Selected === 0) return '';
    const tooltip = getSelectorTooltip(categoryName);
    return `<button data-category="${categoryName}" class="category-btn ${categoryName === currentCategory ? 'active' : ''}" data-tooltip="${tooltip}">${categoryName} (${categoryCounts[categoryName]})</button>`;
  }).join('');

  categoryBar.querySelectorAll('.category-btn').forEach(button => {
    button.addEventListener('click', () => {
      const nextCategory = button.dataset.category;
      onCategoryChange(nextCategory);
      categoryBar.querySelectorAll('.category-btn').forEach(existingButton =>
        existingButton.classList.toggle('active', existingButton === button)
      );
    });
  });
}

function renderMobileCategorySelector(mobileSelector, categories, categoryCounts) {
  const currentValue = mobileSelector.value;
  mobileSelector.innerHTML = '';
  categories.forEach(categoryName => {
    if (categoryName === 'Selected' && categoryCounts.Selected === 0) return;
    const tooltip = getSelectorTooltip(categoryName);
    const option = document.createElement('option');
    option.value = categoryName;
    option.textContent = `${categoryName} (${categoryCounts[categoryName]})`;
    option.setAttribute('data-tooltip', tooltip);
    if (categoryName === currentValue) option.selected = true;
    mobileSelector.appendChild(option);
  });

  if (!Array.from(mobileSelector.options).some(option => option.value === currentValue) ||
      (currentValue === 'Selected' && categoryCounts.Selected === 0)) {
    mobileSelector.value = 'All';
  }
}

function renderCategorySelectors(categoryCounts, currentCategory, onCategoryChange) {
  const categoryBar = DOM?.categoryBar || document.getElementById('category-bar');
  const mobileSelector = DOM?.mobileCategorySelector || document.getElementById('mobile-category-selector');

  if (!hasLoadedFieldDefinitions()) {
    if (categoryBar) {
      categoryBar.innerHTML = '';
    }
    if (mobileSelector) {
      mobileSelector.innerHTML = '';
      mobileSelector.value = '';
    }
    return;
  }

  const categories = getAvailableCategories();

  if (categoryBar) {
    renderDesktopCategorySelectors(categoryBar, categories, categoryCounts, currentCategory, onCategoryChange);
  }

  if (mobileSelector) {
    renderMobileCategorySelector(mobileSelector, categories, categoryCounts);
  }
}

export {
  getSelectorTooltip,
  renderCategorySelectors
};
