/**
 * Field definitions and field-group management.
 * Contains backend-provided field definitions and selector helpers.
 * @module FieldDefs
 */

// Field definitions dynamically loaded from backend
let fieldDefsArray = [];
let fieldDefs = new Map();
let filteredDefs = [];
let isFieldsLoaded = false;
const SYSTEM_CATEGORIES = ['All', 'Selected'];

window.hasLoadedFieldDefinitions = function hasLoadedFieldDefinitions() {
  return isFieldsLoaded && fieldDefsArray.length > 0;
};

function normalizeCategoryName(category) {
  return (typeof category === 'string') ? category.trim() : '';
}

function getAvailableCategories() {
  if (!window.hasLoadedFieldDefinitions()) {
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

window.loadFieldDefinitions = async function loadFieldDefinitions() {
    if (isFieldsLoaded) return fieldDefsArray;
    
    try {
        const response = await fetch('https://mlp.sirsi.net/uhtbin/query_api.pl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_fields' })
        });
        
        if (!response.ok) {
            throw new Error('HTTP error: ' + response.status);
        }
        
        const data = await response.json();
        
        let errorMsg = null;
        if (data.error) {
            errorMsg = data.error;
            console.error("Backend reported an issue when loading fields:", errorMsg);
            if (window.showToastMessage) {
                window.showToastMessage("Warning: " + errorMsg, "warning");
            }
        }
        
        fieldDefsArray = Array.isArray(data) ? [...data] : (data.fields ? [...data.fields] : []);
        
        if (fieldDefsArray.length === 0) {
           console.warn("Received empty field definitions", data);
        }

        // Initialize helper map and filter array
        fieldDefs.clear();
        fieldDefsArray.forEach(field => fieldDefs.set(field.name, field));
        filteredDefs = [...fieldDefsArray];

        window.fieldDefsArray = fieldDefsArray;
        window.fieldDefs = fieldDefs;
        window.filteredDefs = filteredDefs;
        
        isFieldsLoaded = true;
        return fieldDefsArray;
    } catch (e) {
        console.error("Failed to load backend field mappings.", e);
        if (window.showToastMessage) {
            window.showToastMessage("Could not load field settings from backend", "error");
        }
        return [];
    }
}

// Ensure the map export remains attached after loading
// fieldDefs was already initialized at the top
fieldDefs = new Map(fieldDefsArray.map(field => [field.name, field]));

// Initialize filtered defs
filteredDefs = [...fieldDefsArray];

/**
 * Returns all field definitions.
 * @function getAllFieldDefs
 * @returns {Object[]} Array of field definition objects
 */
function getAllFieldDefs() {
  return fieldDefsArray;
}

/**
 * Updates the filtered definitions array based on search term.
 * Filters field definitions by name matching the search term.
 * @function updateFilteredDefs
 * @param {string} searchTerm - The search term to filter by
 * @returns {Object[]} Array of filtered field definition objects
 */
function updateFilteredDefs(searchTerm) {
  if (searchTerm === '') {
    filteredDefs = [...getAllFieldDefs()];
  } else {
    filteredDefs = getAllFieldDefs().filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }
  // Keep window.filteredDefs in sync so other scripts (e.g. bubble.js) see the updated array
  window.filteredDefs = filteredDefs;
  return filteredDefs;
}

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
  const categoryBar = document.getElementById('category-bar');
  const mobileSelector = document.getElementById('mobile-category-selector');

  if (!window.hasLoadedFieldDefinitions()) {
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
window.filteredDefs = filteredDefs;
window.updateFilteredDefs = updateFilteredDefs;
window.shouldFieldHavePurpleStylingBase = shouldFieldHavePurpleStylingBase;
window.calculateCategoryCounts = calculateCategoryCounts;
window.renderCategorySelectors = renderCategorySelectors;
