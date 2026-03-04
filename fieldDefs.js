/**
 * Field definitions and category management
 * Contains all available field definitions with their properties, categories, and filtering options.
 * @module FieldDefs
 */

// Field definitions data array - aligned with SirsiCommandCreator.pm
const fieldDefsArray = [
    // --- Catalog Fields (Selcatalog) ---
    { "name": "Catalog Key", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Unique identifier for the Title Record" },
    { "name": "Title", "type": "string", "filters": ["contains", "starts", "equals"], "category": "Catalog", "desc": "Full title of the work" },
    { "name": "Title (Short)", "type": "string", "filters": ["contains", "starts", "equals"], "category": "Catalog", "desc": "Brief title or title fragment" },
    { "name": "Author", "type": "string", "filters": ["contains", "starts", "equals"], "category": "Catalog", "desc": "The author or creator of the item" },
    { "name": "Author Display", "type": "string", "filters": ["contains"], "category": "Catalog", "desc": "Formatted author name for display" },
    { "name": "Author Browse", "type": "string", "filters": ["starts"], "category": "Catalog", "desc": "Heading string used for author browsing" },
    { "name": "Author Key", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Key used for author indexing" },
    { "name": "Subject Display", "type": "string", "filters": ["contains"], "category": "Catalog", "desc": "Subject headings formatted for display" },
    { "name": "Subject Browse", "type": "string", "filters": ["starts"], "category": "Catalog", "desc": "Heading string used for subject browsing" },
    { "name": "Year of Publication", "type": "number", "filters": ["greater", "less", "equals", "between"], "category": "Catalog", "desc": "Publication year parsed from the record" },
    { "name": "Catalog Date Created", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Catalog", "desc": "Date the Title Record was created" },
    { "name": "Date Cataloged", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Catalog", "desc": "Date the Title Record was formally cataloged" },
    { "name": "Date Last Modified", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Catalog", "desc": "Date of the last user modification" },
    { "name": "Created By", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "User ID who created the record" },
    { "name": "Modified By", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "User ID who last modified the record" },
    { "name": "Format", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Configuration Rule for Bibliographic format" },
    { "name": "Material Type", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Configuration Rule for material type" },
    { "name": "Collection Category", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Configuration Rule for Collection Category" },
    { "name": "Title Hold Count", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of Reservations placed on this Title Record" },
    { "name": "Total Holds", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Total number of Reservations linked" },
    { "name": "Call Number Count", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Total number of Call Numbers linked" },
    { "name": "Library Count", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of libraries holding Physical Copies" },
    { "name": "Catalog Shadowed", "type": "boolean", "filters": ["equals"], "category": "Catalog", "desc": "Indicates if the Title Record is Hidden" },
    { "name": "IMMS Material Type", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Material type code used by IMMS" },
    { "name": "Non-return Period", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Period during which the Physical Copy cannot be returned" },
    { "name": "Period Until Rotatable", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Time period before local Physical Copies become rotatable" },
    { "name": "Minimum Performance", "type": "number", "filters": ["greater", "less", "equals"], "category": "Catalog", "desc": "Minimum Checkout performance threshold" },
    { "name": "Maximum Performance", "type": "number", "filters": ["greater", "less", "equals"], "category": "Catalog", "desc": "Maximum Checkout performance threshold" },
    { "name": "Period Performance", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Performance metrics over a specific period" },
    { "name": "New Material Date", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Catalog", "desc": "Date until which the Physical Copy is considered 'New'" },
    { "name": "Hold Exempt Date", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Catalog", "desc": "Date until which the Title Record is exempt from Reservations" },
    { "name": "Last Callnum", "type": "number", "filters": ["greater", "less", "equals"], "category": "Catalog", "desc": "Sequence number of the last Call Number created" },
    { "name": "Catalog Accountability", "type": "number", "filters": ["greater", "less", "equals"], "category": "Catalog", "desc": "Accountability claim count" },
    { "name": "Review Records", "type": "boolean", "filters": ["equals"], "category": "Catalog", "desc": "Indicates if the record is flagged for review" },
    { "name": "Heading Offset", "type": "number", "filters": ["equals"], "category": "Catalog", "desc": "Offset to the heading entry" },
    { "name": "Marc File Number", "type": "number", "filters": ["equals"], "category": "Catalog", "desc": "Index identifier of the MARC file" },
    { "name": "Marclist Offset", "type": "number", "filters": ["equals"], "category": "Catalog", "desc": "Internal data pointer to the MARClist file" },
    { "name": "MARC Offset Number", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Internal data pointer to the record within the MARC file" },
    { "name": "Catalog System Date Modified", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Catalog", "desc": "Date the Title Record was last modified by the system" },
    { "name": "Status", "type": "number", "filters": ["equals"], "category": "Catalog", "desc": "Internal status flags" },
    { "name": "Catalog Input Strings", "type": "string", "filters": ["contains"], "category": "Catalog", "desc": "Original input strings" },
    { "name": "Entries", "type": "string", "filters": ["contains"], "category": "Catalog", "desc": "Symphony entry IDs" },
    { "name": "Visible Call Number Count", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of Call Numbers visible" },
    { "name": "Shadow Call Number Count", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of Hidden from public view Call Numbers" },
    { "name": "Copies on Open Order", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of Physical Copies currently on open order" },
    { "name": "Flexible Key", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Flexible key" },

    // --- Call Number Fields (Selcallnum) ---
    { "name": "Call Number", "type": "string", "filters": ["contains", "equals", "between"], "category": "Call #", "desc": "The call number assigned to the item" },
    { "name": "Call Number Key", "type": "string", "filters": ["equals"], "category": "Call #", "desc": "Unique identifier for the Call Number" },
    { "name": "Call Number Library", "type": "string", "filters": ["equals"], "category": "Call #", "desc": "Library organization owning this Call Number" },
    { "name": "Classification", "type": "string", "filters": ["equals"], "category": "Call #", "desc": "Configuration Rule for classification" },
    { "name": "Call Number Shadowed", "type": "boolean", "filters": ["equals"], "category": "Call #", "desc": "Indicates if the Call Number is Hidden" },
    { "name": "Copy Count", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of Physical Copies" },
    { "name": "Call Hold Count", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of Reservations placed specifically" },
    { "name": "Base Call Number", "type": "string", "filters": ["contains"], "category": "Call #", "desc": "Base portion of the Call Number" },
    { "name": "Call Number Text", "type": "string", "filters": ["contains"], "category": "Call #", "desc": "Display text of the Call Number" },
    { "name": "Analytic Position", "type": "number", "filters": ["equals"], "category": "Call #", "desc": "Position within a series of chapters" },
    { "name": "Bound-with Level", "type": "string", "filters": ["equals"], "category": "Call #", "desc": "Indication of bound-with relationship level" },
    { "name": "Visible Copies", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of Physical Copies visible" },
    { "name": "Copies on Reserve", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of Physical Copies currently on academic reserve" },
    { "name": "Reserve Control Records", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of linked academic reserve records" },
    { "name": "Shelving Key", "type": "string", "filters": ["contains"], "category": "Call #", "desc": "Normalized key used for sorting Physical Copies" },
    { "name": "Call Number Regex", "type": "string", "filters": ["contains"], "category": "Call #", "desc": "Matches Call Numbers" },
    { "name": "Call Number System Date Modified", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Call #", "desc": "Date the Call Number record was last modified" },
    { "name": "Analytics", "type": "string", "filters": ["contains"], "category": "Call #", "desc": "Chapter entries" },
    { "name": "Call Number Input Strings", "type": "string", "filters": ["contains"], "category": "Call #", "desc": "Original input strings" },
    
    // --- Item Fields (Selitem) ---
    { "name": "Item Id", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Barcode identifier of the Physical Copy" },
    { "name": "Item Key", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Unique identifier for a specific Physical Copy" },
    { "name": "Item Library", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Library where item is located", "multiSelect": true, "values": [
        { "Name": "TRLS-A", "RawValue": "TRLS-A" }, { "Name": "TRLS-B", "RawValue": "TRLS-B" }, { "Name": "TRLS-C", "RawValue": "TRLS-C" },
        { "Name": "MLTN-A", "RawValue": "MLTN-A" }, { "Name": "MLTN-B", "RawValue": "MLTN-B" }, { "Name": "WSPR-X", "RawValue": "WSPR-X" }
    ] },
    { "name": "Home Location", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Home location or shelving location of the item" },
    { "name": "Current Location", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Current physical location of the item" },
    { "name": "Item Type", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Type or format of the item (e.g., book, DVD)" },
    { "name": "Price", "type": "money", "filters": ["greater", "less", "equals", "between"], "category": "Item", "desc": "The price of the item" },
    { "name": "Bill Count", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of User Fine/Fees" },
    { "name": "Charge Count", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of current Checkouts" },
    { "name": "Item Total Charges", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Total number of times this Physical Copy has been Checked out" },
    { "name": "Permanent", "type": "boolean", "filters": ["equals"], "category": "Item", "desc": "Is item permanent" },
    { "name": "Recirculation Flags", "type": "boolean", "filters": ["equals"], "category": "Item", "desc": "Indicates if the item can be recirculated" },
    { "name": "Item Shadowed", "type": "boolean", "filters": ["equals"], "category": "Item", "desc": "Is item hidden from public" },
    { "name": "Item Date Created", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Item", "desc": "Date item record was created" },
    { "name": "Date Last Used", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Item", "desc": "Date the Physical Copy was last used" },
    { "name": "Date Last Charged", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Item", "desc": "Date the copy was last checked out" },
    { "name": "Date Inventoried", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Item", "desc": "Date the copy was last inventoried" },
    { "name": "Last User Key", "type": "string", "filters": ["equals"], "category": "Item", "desc": "User ID of the last patron to switch status" },
    { "name": "Inventory Count", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of times inventoried" },
    { "name": "In-House Charges", "type": "number", "filters": ["greater", "less", "equals"], "category": "Metrics", "desc": "Number of times used in-house" },
    { "name": "Available Hold Key", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Key of the hold available for this copy" },
    { "name": "User Hold Key", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Key of the hold filling this copy" },
    { "name": "Category1", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Statistical Category 1" },
    { "name": "Category2", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Statistical Category 2" },
    { "name": "Category3", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Statistical Category 3" },
    { "name": "Category4", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Statistical Category 4" },
    { "name": "Category5", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Statistical Category 5" },
    { "name": "Media Desk", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Media desk location" },
    { "name": "Reserve Desk", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Reserve desk location" },
    { "name": "Distribution Key", "type": "string", "filters": ["equals"], "category": "Item", "desc": "Distribution key" },
    { "name": "Item Accountability", "type": "number", "filters": ["greater", "less", "equals"], "category": "Item", "desc": "Accountability claim count" },
    { "name": "Pieces", "type": "number", "filters": ["greater", "less", "equals"], "category": "Item", "desc": "Number of pieces" },
    { "name": "Transit Status", "type": "number", "filters": ["equals"], "category": "Item", "desc": "Transit status flag" },
    { "name": "Item Input Strings", "type": "string", "filters": ["contains"], "category": "Item", "desc": "Original input strings" },
    { "name": "Extended Info Offset", "type": "number", "filters": ["equals"], "category": "Item", "desc": "Internal pointer to extended info" },
    
    // --- Transit Fields (Seltransit) ---
    { "name": "Transit Destination Library", "type": "string", "filters": ["equals"], "category": "Transit", "desc": "Library the item is being sent to" },
    { "name": "Transit Source Library", "type": "string", "filters": ["equals"], "category": "Transit", "desc": "Library the item was sent from (From)" },
    { "name": "Transit Creating Library", "type": "string", "filters": ["equals"], "category": "Transit", "desc": "Library that created the transit record" },
    { "name": "Transit Date Sent", "type": "date", "filters": ["before", "after", "equals", "between"], "category": "Transit", "desc": "Date the item was put in transit" },
    { "name": "Transit Reason", "type": "string", "filters": ["equals"], "category": "Transit", "desc": "Reason for transit" },
    { "name": "Transit Hold Key", "type": "string", "filters": ["equals"], "category": "Transit", "desc": "Key of the hold triggering this transit" },

    // --- Special ---
    { "name": "Marc", "type": "string", "category": "Marc", "isSpecialMarc": true, "desc": "Create custom MARC field filters by specifying a MARC field number" }
];

// Helper to quickly find field def
const fieldDefs = new Map(fieldDefsArray.map(field => [field.name, field]));

// Categories array - Including "Selected" for filtered view
const categories = ['All', 'Selected', 'Catalog', 'Call #', 'Item', 'Metrics', 'Transit', 'Marc'];

// Initialize filtered defs
let filteredDefs = [...fieldDefsArray];

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
 * Calculates the count of fields in each category.
 * @function calculateCategoryCounts
 * @param {string[]} displayedFields - Array of currently displayed field names
 * @param {Object} activeFilters - Object containing active filter configurations
 * @returns {Object} Object mapping category names to field counts
 */
function calculateCategoryCounts(displayedFields, activeFilters) {
  const categoryCounts = {};
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
 * Renders category selectors for both desktop and mobile interfaces.
 * Creates clickable category buttons with counts and tooltips.
 * @function renderCategorySelectors
 * @param {Object} categoryCounts - Object mapping category names to counts
 * @param {string} currentCategory - Currently selected category
 * @param {Function} onCategoryChange - Callback function when category changes
 */
function renderCategorySelectors(categoryCounts, currentCategory, onCategoryChange) {
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

// Export global variables and functions for use in other modules
window.fieldDefs = fieldDefs;
window.fieldDefsArray = fieldDefsArray;
window.filteredDefs = filteredDefs;
window.categories = categories;
window.getAllFieldDefs = getAllFieldDefs;
window.updateFilteredDefs = updateFilteredDefs;
window.shouldFieldHavePurpleStylingBase = shouldFieldHavePurpleStylingBase;
window.calculateCategoryCounts = calculateCategoryCounts;
window.renderCategorySelectors = renderCategorySelectors;
