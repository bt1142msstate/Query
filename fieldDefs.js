/**
 * Field definitions and category management
 * Contains all available field definitions with their properties, categories, and filtering options.
 * @module FieldDefs
 */

// Field definitions data array
// Exporting this mainly for tests or bulk operations
export const fieldDefsArray = [
  { "name": "Library", "type": "string", "values": [
    { "Name": "TRLS-A", "RawValue": "1", "Description": "Main branch, downtown" },
    { "Name": "TRLS-B", "RawValue": "2", "Description": "Branch library, north side" },
    { "Name": "TRLS-C", "RawValue": "3", "Description": "Branch library, west side" },
    { "Name": "MLTN-A", "RawValue": "4", "Description": "Milton main library" },
    { "Name": "MLTN-B", "RawValue": "5", "Description": "Milton branch library" },
    { "Name": "WSPR-X", "RawValue": "6", "Description": "Whisper special collection" }
  ], "filters": ["equals"], "category": "Item", "multiSelect": true, "desc": "Owning library for the item" },
  { "name": "Author", "type": "string", "filters": ["contains", "starts", "equals"], "category": "Catalog", "desc": "The author or creator of the item" },
  { "name": "Title", "type": "string", "filters": ["contains", "starts", "equals"], "category": "Catalog", "desc": "The title of the item" },
  { "name": "Price", "type": "money", "category": "Catalog", "desc": "The price of the item" },
  { "name": "Call Number", "type": "string", "filters": ["contains", "equals", "between"], "category": "Call #", "desc": "The call number assigned to the item" },
  { "name": "Catalog Key", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Unique catalog key for the item" },
  { "name": "Barcode", "type": "string", "category": "Item", "desc": "Barcode identifier for the item" },
  { "name": "Item Type", "type": "string", "category": "Item", "desc": "Type or format of the item (e.g., book, DVD)" },
  { "name": "Home Location", "type": "string", "category": "Item", "desc": "Home location or shelving location of the item" },
  { "name": "Marc", "type": "string", "category": "Marc", "isSpecialMarc": true, "desc": "Create custom MARC field filters by specifying a MARC field number" },
  { "name": "Item Creation Date", "type": "date", "category": ["Item", "Dates"], "desc": "Date the item record was created" },
  { "name": "Item Total Charges", "type": "number", "category": "Item", "desc": "Total number of times the item has been charged (checked out)" },
  { "name": "Item Last Used", "type": "date", "category": ["Item", "Dates"], "desc": "Date the item was last used or checked out" },
  { "name": "Number of Bills", "type": "number", "category": "Item", "desc": "Number of bills associated with the item" },
  { "name": "Number of Current Charges", "type": "number", "category": "Item", "desc": "Number of current charges on the item" },
  { "name": "Category1", "type": "string", "category": "Item", "desc": "Custom category 1 for the item" },
  { "name": "Category2", "type": "string", "category": "Item", "desc": "Custom category 2 for the item" },
  { "name": "Copy Hold Count", "type": "number", "category": "Item", "desc": "Number of holds on this copy" },
  { "name": "In-House Charges", "type": "number", "category": "Item", "desc": "Number of in-house uses (not checked out)" },
  { "name": "Extended Info Offset", "type": "number", "category": "Item", "desc": "Offset for extended information in the item record" },
  { "name": "Current Location", "type": "string", "category": "Item", "desc": "Current location of the item (may differ from home location)" },
  { "name": "Last Charged Date", "type": "date", "category": ["Item", "Dates"], "desc": "Date the item was last checked out" },
  { "name": "Permanent/Temporary", "type": "string", "values": [
    { "Name": "Yes", "RawValue": "Y", "Description": "Permanent item" },
    { "Name": "No", "RawValue": "N", "Description": "Temporary item" }
  ], "filters": ["equals"], "category": "Item", "desc": "Indicates if the item is permanent or temporary" },
  { "name": "Reserve Control Key", "type": "number", "category": "Item", "desc": "Key for reserve control on the item" },
  { "name": "Last User Key", "type": "string", "category": "Item", "desc": "Key of the last user who checked out the item" },
  { "name": "Recirculation Flag", "type": "string", "values": [
    { "Name": "Yes", "RawValue": "Y", "Description": "Item can be recirculated" },
    { "Name": "No", "RawValue": "N", "Description": "Item cannot be recirculated" },
    { "Name": "Maybe", "RawValue": "M", "Description": "Recirculation status depends on conditions" }
  ], "filters": ["equals"], "category": "Item", "desc": "Indicates if the item can be recirculated" },
  { "name": "Inventory Date", "type": "date", "category": ["Item", "Dates"], "desc": "Date the item was last inventoried" },
  { "name": "Inventory Count", "type": "number", "category": "Item", "desc": "Number of times the item has been inventoried" },
  { "name": "Available Hold Key", "type": "number", "category": "Item", "desc": "Key for available holds on the item" },
  { "name": "Publication Date", "type": "date", "category": ["Item", "Dates"], "desc": "Publication date of the item" },
  { "name": "Catalog Accountability", "type": "number", "category": "Catalog", "desc": "Accountability code for the catalog record" },
  { "name": "Catalog Last Callnum", "type": "number", "category": "Catalog", "desc": "Last call number used in the catalog record" },
  { "name": "Catalog MARClist Offset", "type": "number", "category": "Catalog", "desc": "Offset for MARC list in the catalog record" },
  { "name": "Catalog Format", "type": "string", "category": "Catalog", "desc": "Format of the catalog record (e.g., MARC, Dublin Core)" },
  { "name": "Catalog # of Libraries", "type": "number", "category": "Catalog", "desc": "Number of libraries associated with the catalog record" },
  { "name": "Catalog # of Title Holds", "type": "number", "category": "Catalog", "desc": "Number of title-level holds in the catalog" },
  { "name": "Catalog IMMS Material Type", "type": "string", "category": "Catalog", "desc": "IMMS material type code for the catalog record" },
  { "name": "Catalog # of Total Holds", "type": "number", "category": "Catalog", "desc": "Total number of holds in the catalog" },
  { "name": "Catalog MARC Offset/Link", "type": "number", "category": "Catalog", "desc": "Offset or link to MARC data in the catalog record" },
  { "name": "Catalog # of Callnums", "type": "number", "category": "Catalog", "desc": "Number of call numbers in the catalog record" },
  { "name": "Catalog Creation Date", "type": "date", "category": ["Catalog", "Dates"], "desc": "Date the catalog record was created" },
  { "name": "Catalog Cataloged Date", "type": "date", "category": ["Catalog", "Dates"], "desc": "Date the item was cataloged" },
  { "name": "Catalog Last Modified Date", "type": "date", "category": ["Catalog", "Dates"], "desc": "Date the catalog record was last modified" },
  { "name": "Catalog Created Login", "type": "string", "category": "Catalog", "desc": "Login of the user who created the catalog record" },
  { "name": "Catalog BRS Status", "type": "number", "category": "Catalog", "desc": "BRS status code for the catalog record" },
  { "name": "Catalog Last Modified By", "type": "string", "category": "Catalog", "desc": "User who last modified the catalog record" },
  { "name": "Catalog Material Type", "type": "string", "category": "Catalog", "desc": "Material type of the catalog record" },
  { "name": "Catalog Collection Category", "type": "string", "category": "Catalog", "desc": "Collection category for the catalog record" },
  { "name": "Catalog New Material Date", "type": "date", "category": ["Catalog", "Dates"], "desc": "Date new material was added to the catalog" },
  { "name": "Catalog Non-Return Period", "type": "string", "category": "Catalog", "desc": "Non-return period for the catalog record" },
  { "name": "Catalog Period Until Rotatable", "type": "string", "category": "Catalog", "desc": "Period until the item can be rotated" },
  { "name": "Catalog Minimum Performance", "type": "number", "category": "Catalog", "desc": "Minimum performance value for the catalog record" },
  { "name": "Catalog Maximum Performance", "type": "number", "category": "Catalog", "desc": "Maximum performance value for the catalog record" },
  { "name": "Catalog Period Performance", "type": "string", "category": "Catalog", "desc": "Performance period for the catalog record" },
  { "name": "Catalog # of Visible Callnums", "type": "number", "category": "Catalog", "desc": "Number of visible call numbers in the catalog record" },
  { "name": "Catalog # of Shadow Callnums", "type": "number", "category": "Catalog", "desc": "Number of shadowed call numbers in the catalog record" },
  { "name": "Catalog # of Copies on Open Order", "type": "number", "category": "Catalog", "desc": "Number of copies on open order in the catalog record" },
  { "name": "Catalog Review Record Flag", "type": "number", "category": "Catalog", "desc": "Review record flag for the catalog record" },
  { "name": "Catalog Heading Offset", "type": "number", "category": "Catalog", "desc": "Heading offset in the catalog record" },
  { "name": "Catalog MARC File Number", "type": "number", "category": "Catalog", "desc": "MARC file number for the catalog record" },
  { "name": "Catalog Shadowed Flag", "type": "number", "category": "Catalog", "desc": "Shadowed flag for the catalog record" },
  { "name": "Catalog Hold Exempt Date", "type": "date", "category": ["Catalog", "Dates"], "desc": "Date the catalog record was exempted from holds" },
  { "name": "Catalog System Date Modified", "type": "date", "category": ["Catalog", "Dates"], "desc": "System date the catalog record was last modified" },
  { "name": "Call Number Key", "type": "string", "category": "Call #", "desc": "Key for the call number" },
  { "name": "Analytic Position", "type": "number", "category": "Item", "desc": "Analytic position for the item" },
  { "name": "Bound-with Level", "type": "string", "values": [
    { "Name": "None", "RawValue": "NONE", "Description": "Not part of a bound-with relationship" },
    { "Name": "Child", "RawValue": "CHILD", "Description": "Child item in a bound-with relationship" },
    { "Name": "Parent", "RawValue": "PARENT", "Description": "Parent item in a bound-with relationship" }
  ], "filters": ["equals"], "category": "Item", "desc": "Bound-with level for the item" },
  { "name": "Number of Copies", "type": "number", "category": ["Item"], "desc": "Number of copies of the item" },
  { "name": "System Date Modified", "type": "date", "category": ["Item", "Dates"], "desc": "System date the item was last modified" },
  { "name": "Call-level Holds", "type": "number", "category": "Item", "desc": "Number of call-level holds on the item" },
  { "name": "Number of Reserve Controls", "type": "number", "category": "Item", "desc": "Number of reserve controls for the item" },
  { "name": "Number of Copies on Reserve", "type": "number", "category": "Item", "desc": "Number of copies of the item on reserve" },
  { "name": "Number of Visible Copies", "type": "number", "category": "Item", "desc": "Number of visible copies of the item" },
  { "name": "Shadowed Flag", "type": "string", "values": [
    { "Name": "Yes", "RawValue": "Y", "Description": "Item is shadowed from public view" },
    { "Name": "No", "RawValue": "N", "Description": "Item is visible to the public" }
  ], "filters": ["equals"], "category": "Item", "desc": "Indicates if the item is shadowed" },
  { "name": "Shelving Key", "type": "string", "category": "Item", "desc": "Shelving key for the item" },
  { "name": "Base Call Number", "type": "string", "category": "Item", "desc": "Base call number for the item" },
  { "name": "Item Number", "type": "string", "category": "Item", "desc": "Unique item number" }
];

// Main field definitions Map (global) - keyed by field name
export const fieldDefs = new Map(fieldDefsArray.map(field => [field.name, field]));

/**
 * Gets all field definitions as an array for compatibility.
 * @function getAllFieldDefs
 * @returns {Object[]} Array of all field definition objects
 */
export const getAllFieldDefs = () => Array.from(fieldDefs.values());

// Filtered definitions (starts as full set, gets filtered by search)
// We export an object to hold this state that can be imported
export const fieldDefState = {
  filteredDefs: [...getAllFieldDefs()]
};

// Derive categories from field definitions
const derivedCatSet = new Set();
getAllFieldDefs().forEach(d => {
  const cat = d.category;
  if (Array.isArray(cat)) {
    cat.forEach(c => derivedCatSet.add(c));
  } else {
    derivedCatSet.add(cat);
  }
});
const derivedCats = Array.from(derivedCatSet);

// Complete categories list with universal filters
export const categories = ['All', 'Selected', ...derivedCats];

/**
 * Checks if a field should have purple styling (filtered or displayed).
 * @function shouldFieldHavePurpleStylingBase
 * @param {string} fieldName - The name of the field to check
 * @param {string[]} displayedFields - Array of currently displayed field names
 * @param {Object} activeFilters - Object containing active filter configurations
 * @returns {boolean} True if field should have purple styling
 */
export function shouldFieldHavePurpleStylingBase(fieldName, displayedFields, activeFilters) {
  // Check if the field has active filters
  const hasFilters = activeFilters[fieldName] && 
                    activeFilters[fieldName].filters && 
                    activeFilters[fieldName].filters.length > 0;
  
  // Check if the field is displayed as a column
  const isDisplayed = displayedFields.includes(fieldName);
  
  return hasFilters || isDisplayed;
}

/**
 * Calculates the count of fields in each category.
 * @function calculateCategoryCounts
 * @param {string[]} displayedFields - Array of currently displayed field names
 * @param {Object} activeFilters - Object containing active filter configurations
 * @returns {Object} Object mapping category names to field counts
 */
export function calculateCategoryCounts(displayedFields, activeFilters) {
  const categoryCounts = {};
  const allFieldDefs = getAllFieldDefs();
  categories.forEach(cat => {
    if (cat === 'All') {
      categoryCounts.All = allFieldDefs.length;
    } else if (cat === 'Selected') {
      categoryCounts.Selected = allFieldDefs.filter(d => 
        shouldFieldHavePurpleStylingBase(d.name, displayedFields, activeFilters)
      ).length;
    } else {
      categoryCounts[cat] = allFieldDefs.filter(d => {
        const c = d.category;
        return Array.isArray(c) ? c.includes(cat) : c === cat;
      }).length;
    }
  });
  return categoryCounts;
}

/**
 * Renders category selectors for both desktop and mobile interfaces.
 * Creates clickable category buttons with counts and tooltips.
 * @function renderCategorySelectors
 * @param {Object} categoryCounts - Object mapping category names to counts
 * @param {string} currentCategory - Currently selected category
 * @param {Function} onCategoryChange - Callback function when category changes
 */
export function renderCategorySelectors(categoryCounts, currentCategory, onCategoryChange) {
  const categoryBar = document.getElementById('category-bar');
  const mobileSelector = document.getElementById('mobile-category-selector');

  // Render desktop category bar
  if (categoryBar) {
    categoryBar.innerHTML = categories.map(cat => {
      if (cat === 'Selected' && categoryCounts.Selected === 0) return '';
      // Tooltip descriptions for each category
      let tooltip = '';
      switch (cat) {
        case 'All': tooltip = 'Show all available fields'; break;
        case 'Selected': tooltip = 'Show fields currently in use (displayed or filtered)'; break;
        case 'Marc': tooltip = 'MARC-specific fields and custom MARC field filters'; break;
        case 'Call #': tooltip = 'Fields related to call numbers'; break;
        case 'Catalog': tooltip = 'Fields from the catalog record'; break;
        case 'Item': tooltip = 'Fields specific to the item record'; break;
        case 'Dates': tooltip = 'Fields representing dates'; break;
        default: tooltip = `Show fields in the ${cat} category`;
      }
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
      // Tooltip descriptions for each category
      let tooltip = '';
      switch (cat) {
        case 'All': tooltip = 'Show all available fields'; break;
        case 'Selected': tooltip = 'Show fields currently in use (displayed or filtered)'; break;
        case 'Marc': tooltip = 'MARC-specific fields and custom MARC field filters'; break;
        case 'Call #': tooltip = 'Fields related to call numbers'; break;
        case 'Catalog': tooltip = 'Fields from the catalog record'; break;
        case 'Item': tooltip = 'Fields specific to the item record'; break;
        case 'Dates': tooltip = 'Fields representing dates'; break;
        default: tooltip = `Show fields in the ${cat} category`;
      }
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

/**
 * Updates the filtered definitions array based on search term.
 * Filters field definitions by name matching the search term.
 * @function updateFilteredDefs
 * @param {string} searchTerm - The search term to filter by
 * @returns {Object[]} Array of filtered field definition objects
 */
export function updateFilteredDefs(searchTerm) {
  if (searchTerm === '') {
    fieldDefState.filteredDefs = [...getAllFieldDefs()];
  } else {
    fieldDefState.filteredDefs = getAllFieldDefs().filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }
  return fieldDefState.filteredDefs;
}

// Temporary Global Exposure (for transition)
window.fieldDefs = fieldDefs;
window.fieldDefsArray = fieldDefsArray;
window.getAllFieldDefs = getAllFieldDefs;
window.shouldFieldHavePurpleStylingBase = shouldFieldHavePurpleStylingBase;
