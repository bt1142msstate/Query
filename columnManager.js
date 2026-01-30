/**
 * Column Management Logic
 * Handles the logic for managing columns, duplicates, and field groups.
 * Does not handle Drag & Drop UI events.
 * @module ColumnManager
 */

// Store information about removed columns with their duplicates for restoration
window.removedColumnInfo = window.removedColumnInfo || new Map();

/**
 * Checks if a field or any of its duplicates exists in displayedFields.
 * Uses base field name comparison to detect related columns.
 * @function fieldOrDuplicatesExist
 * @param {string} fieldName - The field name to check for
 * @returns {boolean} True if field or its duplicates exist in displayedFields
 */
window.fieldOrDuplicatesExist = function(fieldName) {
  // Extract base field name (remove ordinal prefixes like "2nd ", "3rd ")
  const baseFieldName = window.getBaseFieldName(fieldName);
  
  // Check if any column in displayedFields is related to this field
  const relatedColumns = window.displayedFields.filter(displayedField => {
    const displayedBase = window.getBaseFieldName(displayedField);
    return displayedBase === baseFieldName;
  });
  
  return relatedColumns.length > 0;
};

/**
 * Gets all duplicate groups in the current displayedFields.
 * @function getDuplicateGroups
 * @returns {Array<{baseField: string, start: number, end: number}>} Array of duplicate groups
 */
window.getDuplicateGroups = function() {
  if (!window.displayedFields || window.displayedFields.length === 0) {
    return [];
  }
  
  const groups = [];
  const fieldCounts = new Map();
  
  // First pass: count occurrences of each base field
  window.displayedFields.forEach(field => {
    const baseField = window.getBaseFieldName(field);
    fieldCounts.set(baseField, (fieldCounts.get(baseField) || 0) + 1);
  });
  
  // Second pass: identify groups of fields that appear more than once
  let i = 0;
  while (i < window.displayedFields.length) {
    const field = window.displayedFields[i];
    const baseField = window.getBaseFieldName(field);
    
    // If this base field appears more than once, it's a duplicate group
    if (fieldCounts.get(baseField) > 1) {
      const start = i;
      let end = i;
      
      // Find the end of this group (all consecutive fields with same base name)
      while (end < window.displayedFields.length) {
        const currentField = window.displayedFields[end];
        const currentBase = window.getBaseFieldName(currentField);
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
};

/**
 * Validates if an insertion position would break up duplicate field groups.
 * @function isValidInsertPosition
 * @param {number} insertAt - The proposed insertion index
 * @returns {boolean} True if the position is valid (won't break up duplicates)
 */
window.isValidInsertPosition = function(insertAt) {
  // For now, just return true to allow all positions
  return true;
};

/**
 * Finds a valid insertion position that won't break duplicate groups.
 * @function findValidInsertPosition
 * @param {number} preferredPosition - The desired insertion position
 * @returns {number} A valid insertion position
 */
window.findValidInsertPosition = function(preferredPosition) {
  // For now, just return the preferred position (no validation)
  return preferredPosition;
};

/**
 * Helper function to find all related columns (including duplicates) for a field
 * @param {string} fieldName - The field name to look for
 * @returns {number[]} Array of indices in displayedFields
 */
window.findRelatedColumnIndices = function(fieldName) {
  // Extract base field name (remove ordinal prefixes like "2nd ", "3rd ")
  const baseFieldName = window.getBaseFieldName(fieldName);
  
  // Find all columns with this base field name
  const relatedIndices = [];
  window.displayedFields.forEach((field, index) => {
    const fieldBase = window.getBaseFieldName(field);
    if (fieldBase === baseFieldName) {
      relatedIndices.push(index);
    }
  });
  
  return relatedIndices.sort((a, b) => a - b);
};

/**
 * Restores a field and its duplicates from stored information or original data.
 * Attempts to restore from removedColumnInfo first, then falls back to original headers.
 * @function restoreFieldWithDuplicates
 * @param {string} fieldName - The field name to restore
 * @param {number} [insertAt=-1] - Position to insert at (-1 for end)
 * @returns {boolean} True if field was successfully restored
 */
window.restoreFieldWithDuplicates = function(fieldName, insertAt = -1) {
  // Check if any duplicate of this field already exists
  if (window.fieldOrDuplicatesExist(fieldName)) {
    return false;
  }
  
  // Check if we have stored duplicate information for this field
  const storedInfo = window.removedColumnInfo.get(fieldName);
  
  if (storedInfo && storedInfo.columnNames) {
    // Remove the stored info since we're restoring
    window.removedColumnInfo.delete(fieldName);
    
    // Insert all duplicate columns at the specified position
    if (insertAt >= 0 && insertAt <= window.displayedFields.length) {
      // Insert all duplicate columns at the specific position
      storedInfo.columnNames.forEach((columnName, index) => {
        window.displayedFields.splice(insertAt + index, 0, columnName);
      });
    } else {
      // Append all duplicate columns at the end
      storedInfo.columnNames.forEach(columnName => {
        window.displayedFields.push(columnName);
      });
    }
    
    return true;
  } else {
    // No stored info, check if this field exists in the original data
    const virtualTableData = window.VirtualTable?.virtualTableData;
    if (virtualTableData && virtualTableData.headers) {
      const relatedColumns = virtualTableData.headers.filter(header => {
        const baseFieldName = window.getBaseFieldName(fieldName);
        const headerBase = window.getBaseFieldName(header);
        return header === fieldName || headerBase === baseFieldName;
      });
      
      if (relatedColumns.length > 0) {
        // Insert all related columns from original data
        if (insertAt >= 0 && insertAt <= window.displayedFields.length) {
          relatedColumns.forEach((columnName, index) => {
            window.displayedFields.splice(insertAt + index, 0, columnName);
          });
        } else {
          relatedColumns.forEach(columnName => {
            window.displayedFields.push(columnName);
          });
        }
        
        return true;
      }
    }
    
    // Fallback to single field - this will show "..." in the table
    if (insertAt >= 0 && insertAt <= window.displayedFields.length) {
      window.displayedFields.splice(insertAt, 0, fieldName);
    } else {
      window.displayedFields.push(fieldName);
    }
    return true; // Changed to true since we did add the field
  }
};
