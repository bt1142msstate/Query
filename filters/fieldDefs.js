/**
 * Field definitions and field-group management.
 * Contains backend-provided field definitions and selector helpers.
 * @module FieldDefs
 */
import { BackendApi } from '../core/backendApi.js';
import { QueryStateReaders } from '../core/queryState.js';
import { showToastMessage } from '../core/toast.js';

// Field definitions dynamically loaded from backend
let fieldDefsArray = [];
let fieldDefs = new Map();
let fieldAliases = new Map();
let filteredDefs = [];
let isFieldsLoaded = false;
let pendingAliasNotifications = new Map();
let aliasToastTimer = null;
const SYSTEM_CATEGORIES = ['All', 'Selected'];

function hasLoadedFieldDefinitions() {
  return isFieldsLoaded && fieldDefsArray.length > 0;
}

window.hasLoadedFieldDefinitions = hasLoadedFieldDefinitions;

function normalizeCategoryName(category) {
  return (typeof category === 'string') ? category.trim() : '';
}

function getAvailableCategories() {
  if (!hasLoadedFieldDefinitions()) {
    return [];
  }

  const seen = new Set();
  const derivedCategories = [];

  fieldDefsArray.forEach(field => {
    const categoryValues = Array.isArray(field.category) ? field.category : [field.category];
    categoryValues.forEach(categoryValue => {
      const normalized = normalizeCategoryName(categoryValue);
      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      derivedCategories.push(normalized);
    });
  });

  return [...SYSTEM_CATEGORIES, ...derivedCategories];
}

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

function scheduleAliasNotificationToast() {
  if (aliasToastTimer || pendingAliasNotifications.size === 0) {
    return;
  }

  aliasToastTimer = window.setTimeout(() => {
    aliasToastTimer = null;

    const updates = Array.from(pendingAliasNotifications.entries());
    pendingAliasNotifications.clear();

    if (!updates.length) {
      return;
    }

    const details = updates
      .map(([alias, canonical]) => `${alias} -> ${canonical}`)
      .join('; ');
    const prefix = updates.length === 1
      ? 'Updated field name:'
      : 'Updated field names:';

    console.info('Normalized aliased field names:', details);
    showToastMessage(`${prefix} ${details}`, 'warning', 5000);
  }, 50);
}

function noteFieldAliasUsage(alias, canonical) {
  if (!alias || !canonical || alias === canonical) {
    return;
  }

  pendingAliasNotifications.set(alias, canonical);
  scheduleAliasNotificationToast();
}

function resolveFieldName(fieldName, options = {}) {
  const normalized = typeof fieldName === 'string' ? fieldName.trim() : '';
  if (!normalized) {
    return '';
  }

  if (fieldAliases.has(normalized)) {
    const canonical = fieldAliases.get(normalized);
    if (options.trackAlias) {
      noteFieldAliasUsage(normalized, canonical);
    }
    return canonical;
  }

  if (fieldDefs.has(normalized)) {
    return fieldDefs.get(normalized)?.name || normalized;
  }

  return normalized;
}

window.resolveFieldName = resolveFieldName;

async function loadFieldDefinitions() {
    if (isFieldsLoaded) return fieldDefsArray;
    
    try {
        const { data } = await BackendApi.postJson({ action: 'get_fields' });
        
        let errorMsg = null;
        if (data.error) {
            errorMsg = data.error;
            console.error("Backend reported an issue when loading fields:", errorMsg);
            showToastMessage("Warning: " + errorMsg, "warning");
        }
        
        fieldDefsArray = Array.isArray(data) ? [...data] : (data.fields ? [...data.fields] : []);
        
        if (fieldDefsArray.length === 0) {
           console.warn("Received empty field definitions", data);
        }

        // Initialize helper map and filter array
        fieldDefs.clear();
        fieldAliases.clear();
        fieldDefsArray.forEach(field => {
          fieldDefs.set(field.name, field);
        });
        fieldDefsArray.forEach(field => {
          const aliases = Array.isArray(field.aliases) ? field.aliases : [];
          aliases.forEach(alias => {
            const normalizedAlias = typeof alias === 'string' ? alias.trim() : '';
            if (!normalizedAlias || fieldDefs.has(normalizedAlias) || fieldAliases.has(normalizedAlias)) {
              return;
            }

            fieldAliases.set(normalizedAlias, field.name);
            fieldDefs.set(normalizedAlias, field);
          });
        });
        filteredDefs = [...fieldDefsArray];

        window.fieldDefsArray = fieldDefsArray;
        window.fieldDefs = fieldDefs;
        window.filteredDefs = filteredDefs;
        
        isFieldsLoaded = true;
        return fieldDefsArray;
    } catch (e) {
        if (e?.isRateLimited) {
            return [];
        }
        console.error("Failed to load backend field mappings.", e);
        showToastMessage("Could not load field settings from backend", "error");
        return [];
    }
}

window.loadFieldDefinitions = loadFieldDefinitions;

/**
 * Updates the filtered definitions array based on search term.
 * Filters field definitions by name matching the search term.
 * @function updateFilteredDefs
 * @param {string} searchTerm - The search term to filter by
 * @returns {Object[]} Array of filtered field definition objects
 */
function updateFilteredDefs(searchTerm) {
  if (searchTerm === '') {
    filteredDefs = [...fieldDefsArray];
  } else {
    filteredDefs = fieldDefsArray.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }
  // Keep window.filteredDefs in sync so other scripts (e.g. bubble.js) see the updated array
  window.filteredDefs = filteredDefs;
  return filteredDefs;
}

function getFieldFilterOperators(fieldOrName) {
  const fieldDef = typeof fieldOrName === 'string'
    ? fieldDefs.get(fieldOrName)
    : fieldOrName;

  if (!fieldDef || typeof fieldDef !== 'object') {
    return [];
  }

  const configured = Array.isArray(fieldDef.filters)
    ? fieldDef.filters
    : (Array.isArray(fieldDef.operators) ? fieldDef.operators : []);

  return configured
    .map(operator => String(operator || '').trim().toLowerCase())
    .filter(Boolean)
    .filter((operator, index, list) => list.indexOf(operator) === index);
}

function isFieldBackendFilterable(fieldOrName) {
  return getFieldFilterOperators(fieldOrName).length > 0;
}

window.getFieldFilterOperators = getFieldFilterOperators;
window.isFieldBackendFilterable = isFieldBackendFilterable;

/**
 * Checks if a field should have purple styling (filtered or displayed).
 * @function shouldFieldHavePurpleStylingBase
 * @param {string} fieldName - The name of the field to check
 * @param {string[]} displayedFields - Array of currently displayed field names
 * @param {Object} activeFilters - Object containing active filter configurations
 * @returns {boolean} True if field should have purple styling
 */
function shouldFieldHavePurpleStylingBase(fieldName, displayedFields, activeFilters) {
  // Check if the field has active filters
  const hasFilters = activeFilters[fieldName] && 
                    activeFilters[fieldName].filters && 
                    activeFilters[fieldName].filters.length > 0;
  
  // Check if the field is displayed as a column
  const isDisplayed = displayedFields.includes(fieldName);
  
  return hasFilters || isDisplayed;
}

function shouldFieldHavePurpleStyling(fieldName) {
  if (!fieldName) return false;

  const displayedFields = QueryStateReaders?.getDisplayedFields?.() || [];
  const activeFilters = QueryStateReaders?.getActiveFilters?.() || {};

  return shouldFieldHavePurpleStylingBase(fieldName, displayedFields, activeFilters);
}

/**
 * Calculates the count of fields in each selector group.
 * @function calculateCategoryCounts
 * @param {string[]} displayedFields - Array of currently displayed field names
 * @param {Object} activeFilters - Object containing active filter configurations
 * @returns {Object} Object mapping selector group names to field counts
 */
function calculateCategoryCounts(displayedFields, activeFilters) {
  const categoryCounts = {};
  const categories = getAvailableCategories();
  categories.forEach(cat => {
    if (cat === 'All') {
      categoryCounts.All = fieldDefsArray.length;
    } else if (cat === 'Selected') {
      categoryCounts.Selected = fieldDefsArray.filter(d => 
        shouldFieldHavePurpleStylingBase(d.name, displayedFields || [], activeFilters || {})
      ).length;
    } else {
      categoryCounts[cat] = fieldDefsArray.filter(d => {
        const c = d.category;
        return Array.isArray(c) ? c.includes(cat) : c === cat;
      }).length;
    }
  });
  return categoryCounts;
}

/**
 * Renders field-group selectors for both desktop and mobile interfaces.
 * Creates clickable selector buttons with counts and tooltips.
 * @function renderCategorySelectors
 * @param {Object} categoryCounts - Object mapping selector group names to counts
 * @param {string} currentCategory - Currently selected selector group
 * @param {Function} onCategoryChange - Callback function when selector changes
 */
function renderCategorySelectors(categoryCounts, currentCategory, onCategoryChange) {
  const categoryBar = window.DOM?.categoryBar || document.getElementById('category-bar');
  const mobileSelector = window.DOM?.mobileCategorySelector || document.getElementById('mobile-category-selector');

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

  // Render desktop category bar
  if (categoryBar) {
    categoryBar.innerHTML = categories.map(cat => {
      if (cat === 'Selected' && categoryCounts.Selected === 0) return '';
      const tooltip = getSelectorTooltip(cat);
      return `<button data-category="${cat}" class="category-btn ${cat === currentCategory ? 'active' : ''}" data-tooltip="${tooltip}">${cat} (${categoryCounts[cat]})</button>`;
    }).join('');
    
    // Attach click handlers
    categoryBar.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newCategory = btn.dataset.category;
        onCategoryChange(newCategory);
        categoryBar.querySelectorAll('.category-btn').forEach(b =>
          b.classList.toggle('active', b === btn)
        );
      });
    });
  }

  // Render mobile selector
  if (mobileSelector) {
    const currentValue = mobileSelector.value;
    mobileSelector.innerHTML = '';
    categories.forEach(cat => {
      if (cat === 'Selected' && categoryCounts.Selected === 0) return;
      const tooltip = getSelectorTooltip(cat);
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = `${cat} (${categoryCounts[cat]})`;
      option.setAttribute('data-tooltip', tooltip);
      if (cat === currentValue) option.selected = true;
      mobileSelector.appendChild(option);
    });
    // If the current category doesn't exist or is Selected with count 0, select All
    if (!Array.from(mobileSelector.options).some(opt => opt.value === currentValue) ||
        (currentValue === 'Selected' && categoryCounts.Selected === 0)) {
      mobileSelector.value = 'All';
    }
  }
}

// Export global variables and functions for use in other modules
window.fieldDefs = fieldDefs;
window.fieldDefsArray = fieldDefsArray;
window.fieldAliases = fieldAliases;
window.filteredDefs = filteredDefs;
window.updateFilteredDefs = updateFilteredDefs;
window.shouldFieldHavePurpleStylingBase = shouldFieldHavePurpleStylingBase;
window.shouldFieldHavePurpleStyling = shouldFieldHavePurpleStyling;
window.calculateCategoryCounts = calculateCategoryCounts;
window.renderCategorySelectors = renderCategorySelectors;

export {
  calculateCategoryCounts,
  fieldAliases,
  fieldDefs,
  fieldDefsArray,
  filteredDefs,
  getAvailableCategories,
  getFieldFilterOperators,
  hasLoadedFieldDefinitions,
  isFieldBackendFilterable,
  loadFieldDefinitions,
  renderCategorySelectors,
  resolveFieldName,
  shouldFieldHavePurpleStyling,
  shouldFieldHavePurpleStylingBase,
  updateFilteredDefs
};
