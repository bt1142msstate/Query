/**
 * Column Management Logic
 * Handles the logic for managing columns, duplicates, and field groups.
 * Does not handle Drag & Drop UI events.
 * @module ColumnManager
 */
import { appServices } from '../../core/appServices.js';
import { QueryChangeManager, getBaseFieldName, QueryStateReaders } from '../../core/queryState.js';

// Store information about removed columns with their duplicates for restoration
const removedColumnInfo = new Map();
var getDisplayedFields = QueryStateReaders.getDisplayedFields.bind(QueryStateReaders);
var services = appServices;

/**
 * Checks if a field or any of its duplicates exists in displayedFields.
 * Uses base field name comparison to detect related columns.
 * @function fieldOrDuplicatesExist
 * @param {string} fieldName - The field name to check for
 * @returns {boolean} True if field or its duplicates exist in displayedFields
 */
function fieldOrDuplicatesExist(fieldName) {
  // Extract base field name (remove ordinal prefixes like "2nd ", "3rd ")
  const baseFieldName = getBaseFieldName(fieldName);
  
  // Check if any column in displayedFields is related to this field
  const relatedColumns = getDisplayedFields().filter(displayedField => {
    const displayedBase = getBaseFieldName(displayedField);
    return displayedBase === baseFieldName;
  });
  
  return relatedColumns.length > 0;
}

/**
 * Gets all duplicate groups in the current displayedFields.
 * @function getDuplicateGroups
 * @returns {Array<{baseField: string, start: number, end: number}>} Array of duplicate groups
 */
function getDuplicateGroups() {
  const displayedFields = getDisplayedFields();
  if (displayedFields.length === 0) {
    return [];
  }
  
  const groups = [];
  const fieldCounts = new Map();
  
  // First pass: count occurrences of each base field
  displayedFields.forEach(field => {
    const baseField = getBaseFieldName(field);
    fieldCounts.set(baseField, (fieldCounts.get(baseField) || 0) + 1);
  });
  
  // Second pass: identify groups of fields that appear more than once
  let i = 0;
  while (i < displayedFields.length) {
    const field = displayedFields[i];
    const baseField = getBaseFieldName(field);
    
    // If this base field appears more than once, it's a duplicate group
    if (fieldCounts.get(baseField) > 1) {
      const start = i;
      let end = i;
      
      // Find the end of this group (all consecutive fields with same base name)
      while (end < displayedFields.length) {
        const currentField = displayedFields[end];
        const currentBase = getBaseFieldName(currentField);
        if (currentBase !== baseField) {
          break;
        }
        end++;
      }
      
      groups.push({ baseField, start, end: end - 1 });
      i = end; // Skip to after this group
    } else {
      i++; // Single field, move to next
    }
  }
  
  return groups;
}

/**
 * Helper function to find all related columns (including duplicates) for a field
 * @param {string} fieldName - The field name to look for
 * @returns {number[]} Array of indices in displayedFields
 */
function findRelatedColumnIndices(fieldName) {
  // Extract base field name (remove ordinal prefixes like "2nd ", "3rd ")
  const baseFieldName = getBaseFieldName(fieldName);
  
  // Find all columns with this base field name
  const relatedIndices = [];
  getDisplayedFields().forEach((field, index) => {
    const fieldBase = getBaseFieldName(field);
    if (fieldBase === baseFieldName) {
      relatedIndices.push(index);
    }
  });
  
  return relatedIndices.sort((a, b) => a - b);
}

/**
 * Restores a field and its duplicates from stored information or original data.
 * Attempts to restore from removedColumnInfo first, then falls back to original headers.
 * @function restoreFieldWithDuplicates
 * @param {string} fieldName - The field name to restore
 * @param {number} [insertAt=-1] - Position to insert at (-1 for end)
 * @returns {boolean} True if field was successfully restored
 */
function restoreFieldWithDuplicates(fieldName, insertAt = -1) {
  // Check if any duplicate of this field already exists
  if (fieldOrDuplicatesExist(fieldName)) {
    return false;
  }
  
  // Check if we have stored duplicate information for this field
  const storedInfo = removedColumnInfo.get(fieldName);
  
  if (storedInfo && storedInfo.columnNames) {
    // Remove the stored info since we're restoring
    removedColumnInfo.delete(fieldName);
    
    // Insert all duplicate columns at the specified position
    QueryChangeManager.addDisplayedField(storedInfo.columnNames, {
      insertAt,
      source: 'ColumnManager.restoreFieldWithDuplicates'
    });
    
    return true;
  } else {
    // No stored info, check if this field exists in the original data
    const virtualTableData = services.getVirtualTableData();
    if (virtualTableData && virtualTableData.headers) {
      const relatedColumns = virtualTableData.headers.filter(header => {
        const baseFieldName = getBaseFieldName(fieldName);
        const headerBase = getBaseFieldName(header);
        return header === fieldName || headerBase === baseFieldName;
      });
      
      if (relatedColumns.length > 0) {
        // Insert all related columns from original data
        QueryChangeManager.addDisplayedField(relatedColumns, {
          insertAt,
          source: 'ColumnManager.restoreFieldWithDuplicates'
        });
        
        return true;
      }
    }
    
    // Fallback to single field - this will show "..." in the table
    QueryChangeManager.addDisplayedField(fieldName, {
      insertAt,
      source: 'ColumnManager.restoreFieldWithDuplicates'
    });
    return true; // Changed to true since we did add the field
  }
}

export {
  fieldOrDuplicatesExist,
  findRelatedColumnIndices,
  getDuplicateGroups,
  removedColumnInfo,
  restoreFieldWithDuplicates
};
