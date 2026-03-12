/**
 * JavaScript implementation of SimpleTable functionality
 * Provides client-side data manipulation including grouping, filtering, and post-processing
 */

// Enum for GroupMethod
const GroupMethod = {
    NONE: 'None',
    COMMAS: 'Commas',
    EXPAND_INTO_COLUMNS: 'ExpandIntoColumns'
};

// Filter operators
const FilterOperator = {
    GREATER_THAN: 'GreaterThan',
    LESS_THAN: 'LessThan',
    EQUALS: 'Equals',
    DOES_NOT_EQUAL: 'DoesNotEqual',
    GREATER_THAN_OR_EQUAL: 'GreaterThanOrEqual',
    LESS_THAN_OR_EQUAL: 'LessThanOrEqual',
    BETWEEN: 'Between',
    CONTAINS: 'Contains',
    DOES_NOT_CONTAIN: 'DoesNotContain'
};

// Logical operators for filter groups
const LogicalOperator = {
    AND: 'And',
    OR: 'Or'
};

/**
 * Represents a single filter condition for data filtering.
 * @class Filter
 */
class Filter {
    /**
     * Creates a new Filter instance.
     * @constructor
     * @param {string} fieldName - The name of the field to filter on
     * @param {string} operator - The filter operator (from FilterOperator enum)
     * @param {Array|string} [values=[]] - The values to filter by
     */
    constructor(fieldName, operator, values = []) {
        this.fieldName = fieldName;
        this.operator = operator;
        this.values = Array.isArray(values) ? values : [values];
    }
}

/**
 * Represents a group of filters combined with a logical operator.
 * @class FilterGroup
 */
class FilterGroup {
    /**
     * Creates a new FilterGroup instance.
     * @constructor
     * @param {string} [logicalOperator=LogicalOperator.AND] - How to combine filters (AND/OR)
     * @param {Filter[]} [filters=[]] - Array of Filter instances
     */
    constructor(logicalOperator = LogicalOperator.AND, filters = []) {
        this.logicalOperator = logicalOperator;
        this.filters = filters;
    }

    /**
     * Adds a filter to this group.
     * @method addFilter
     * @param {Filter} filter - The filter to add
     */
    addFilter(filter) {
        this.filters.push(filter);
    }
}

/**
 * Field specification defining column properties for data processing.
 * @class FieldSpec
 */
class FieldSpec {
    /**
     * Creates a new FieldSpec instance.
     * @constructor
     * @param {string} fieldName - The name of the field
     * @param {number} [rawOutputSegments=1] - Number of raw data segments this field uses
     * @param {string} [dataType='string'] - The data type for this field
     */
    constructor(fieldName, rawOutputSegments = 1, dataType = 'string') {
        this.fieldName = fieldName;
        this.rawOutputSegments = rawOutputSegments;
        this.dataType = dataType.toLowerCase();
    }
}

/**
 * JavaScript implementation of SimpleTable for data processing and manipulation.
 * Provides filtering, grouping, and column reordering functionality.
 * @class SimpleTable
 */
class SimpleTable {
    /**
     * Creates a new SimpleTable instance from configuration.
     * @constructor
     * @param {Object|string} config - Configuration object or JSON string
     * @param {string[]} config.DataLines - Raw data lines to process
     * @param {Object[]} config.RawColumnOrder - Column specifications
     * @param {string[]} config.DesiredColumnOrder - Desired column order
     * @param {Object[]} config.FilterGroups - Filter groups to apply
     * @param {string} config.GroupByField - Field to group by
     * @param {string[]} config.AllowDuplicateFields - Fields that allow duplicates
     * @param {string} config.GroupMethod - Grouping method to use
     */
    constructor(config) {
        // Parse config if it's a string
        if (typeof config === 'string') {
            try {
                config = JSON.parse(config);
            } catch (e) {
                throw new Error('Invalid JSON provided to SimpleTable.');
            }
        }

        if (!config) {
            throw new Error('Invalid configuration provided to SimpleTable.');
        }

        this.dataLines = config.DataLines || [];
        this.rawColumnOrder = (config.RawColumnOrder || []).map(field => 
            new FieldSpec(field.FieldName, field.RawOutputSegments, field.DataType)
        );
        this.desiredColumnOrder = config.DesiredColumnOrder || [];
        this.filterGroups = (config.FilterGroups || []).map(group => 
            new FilterGroup(group.LogicalOperator, group.Filters.map(f => 
                new Filter(f.FieldName, f.FieldOperator, f.Values)
            ))
        );
        this.groupByField = config.GroupByField;
        this.allowDuplicateFields = new Set(config.AllowDuplicateFields || []);
        this.groupMethod = config.GroupMethod || GroupMethod.EXPAND_INTO_COLUMNS;

        // Internal state
        this.width = this.rawColumnOrder.length;
        this.height = 0;
        this.rawTable = [];
        this.tableColumnTypes = [];
        this.fieldIndexMap = new Map();

        // Initialize
        this.createRawTable();
        this.reorderTable();
        this.buildFieldIndexMap();

        // Apply grouping if specified
        if (this.groupByField) {
            this.group(this.groupByField, this.allowDuplicateFields, this.groupMethod);
        }
    }

    /**
     * Convert string value to appropriate type
     */
    convertValue(value, dataType) {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        switch (dataType.toLowerCase()) {
            case 'string':
                return String(value);
            case 'double':
            case 'decimal':
            case 'float':
                const num = parseFloat(value);
                return isNaN(num) ? 0.0 : num;
            case 'int':
            case 'integer':
                const int = parseInt(value);
                return isNaN(int) ? 0 : int;
            case 'datetime':
            case 'date':
                const date = new Date(value);
                return isNaN(date.getTime()) ? new Date() : date;
            case 'boolean':
            case 'bool':
                return value === 'true' || value === '1' || value === 'yes';
            default:
                return String(value);
        }
    }

    /**
     * Parse raw data lines into a typed table
     */
    createRawTable() {
        const filteredRows = [];

        this.dataLines.forEach(line => {
            const parts = line.split('|');
            const rowValues = [];
            let rawIndex = 0;

            for (let col = 0; col < this.width; col++) {
                const fieldSpec = this.rawColumnOrder[col];
                const requiredSegments = fieldSpec.rawOutputSegments;
                
                let rawField = '';
                if (rawIndex < parts.length) {
                    rawField = parts.slice(rawIndex, rawIndex + requiredSegments).join('');
                    rawIndex += requiredSegments;
                }

                // Convert to appropriate type
                const convertedValue = this.convertValue(rawField, fieldSpec.dataType);
                rowValues.push(convertedValue);
            }

            // Apply filters
            if (this.rowPassesAllFilterGroups(rowValues)) {
                filteredRows.push(rowValues);
            }
        });

        this.height = filteredRows.length;
        this.rawTable = [];

        // Build header row
        const headerRow = this.rawColumnOrder.map(spec => spec.fieldName);
        this.rawTable.push(headerRow);
        this.tableColumnTypes = this.rawColumnOrder.map(spec => spec.dataType);

        // Add data rows
        filteredRows.forEach(row => {
            this.rawTable.push(row);
        });
    }

    /**
     * Check if a row passes all filter groups
     */
    rowPassesAllFilterGroups(row) {
        if (!this.filterGroups || this.filterGroups.length === 0) {
            return true;
        }

        return this.filterGroups.every(group => this.rowPassesFilterGroup(row, group));
    }

    /**
     * Check if a row passes a single filter group
     */
    rowPassesFilterGroup(row, group) {
        if (!group || !group.filters || group.filters.length === 0) {
            return true;
        }

        if (group.logicalOperator === LogicalOperator.AND) {
            return group.filters.every(filter => this.evaluateFilter(row, filter));
        } else {
            return group.filters.some(filter => this.evaluateFilter(row, filter));
        }
    }

    /**
     * Evaluate a single filter against a row
     */
    evaluateFilter(row, filter) {
        const fieldIndex = this.fieldIndexMap.get(filter.fieldName);
        if (fieldIndex === undefined) {
            return false;
        }

        const fieldValue = row[fieldIndex];
        const fieldType = this.tableColumnTypes[fieldIndex];

        // Handle numeric comparisons
        if (['double', 'decimal', 'float', 'int', 'integer'].includes(fieldType.toLowerCase())) {
            const numericField = parseFloat(fieldValue);
            const numericValues = filter.values.map(v => parseFloat(v)).filter(v => !isNaN(v));

            switch (filter.operator) {
                case FilterOperator.EQUALS:
                    return numericValues.some(v => Math.abs(numericField - v) < 0.000001);
                case FilterOperator.DOES_NOT_EQUAL:
                    return numericValues.every(v => Math.abs(numericField - v) >= 0.000001);
                case FilterOperator.GREATER_THAN:
                    return numericValues.length > 0 && numericField > numericValues[0];
                case FilterOperator.LESS_THAN:
                    return numericValues.length > 0 && numericField < numericValues[0];
                case FilterOperator.GREATER_THAN_OR_EQUAL:
                    return numericValues.length > 0 && numericField >= numericValues[0];
                case FilterOperator.LESS_THAN_OR_EQUAL:
                    return numericValues.length > 0 && numericField <= numericValues[0];
                case FilterOperator.BETWEEN:
                    if (numericValues.length >= 2) {
                        const lower = Math.min(numericValues[0], numericValues[1]);
                        const upper = Math.max(numericValues[0], numericValues[1]);
                        return numericField >= lower && numericField <= upper;
                    }
                    return false;
                default:
                    return false;
            }
        } else {
            // Handle string comparisons
            const stringValue = String(fieldValue).toLowerCase();

            switch (filter.operator) {
                case FilterOperator.EQUALS:
                    return filter.values.some(v => stringValue === String(v).toLowerCase());
                case FilterOperator.DOES_NOT_EQUAL:
                    return filter.values.every(v => stringValue !== String(v).toLowerCase());
                case FilterOperator.CONTAINS:
                    return filter.values.some(v => stringValue.includes(String(v).toLowerCase()));
                case FilterOperator.DOES_NOT_CONTAIN:
                    return filter.values.every(v => !stringValue.includes(String(v).toLowerCase()));
                default:
                    return false;
            }
        }
    }

    /**
     * Reorder table columns according to desired column order
     */
    reorderTable() {
        if (!this.desiredColumnOrder || this.desiredColumnOrder.length === 0) {
            return;
        }

        const newWidth = this.desiredColumnOrder.length;
        const newTable = [];
        const newColumnTypes = [];

        // Create new header row and track column types
        const newHeaderRow = [];
        this.desiredColumnOrder.forEach(fieldName => {
            const originalIndex = this.rawTable[0].findIndex(header => header === fieldName);
            if (originalIndex !== -1) {
                newHeaderRow.push(fieldName);
                newColumnTypes.push(this.tableColumnTypes[originalIndex]);
            }
        });

        newTable.push(newHeaderRow);

        // Reorder data rows
        for (let row = 1; row < this.rawTable.length; row++) {
            const newRow = [];
            this.desiredColumnOrder.forEach(fieldName => {
                const originalIndex = this.rawTable[0].findIndex(header => header === fieldName);
                if (originalIndex !== -1) {
                    newRow.push(this.rawTable[row][originalIndex]);
                } else {
                    newRow.push('');
                }
            });
            newTable.push(newRow);
        }

        this.rawTable = newTable;
        this.tableColumnTypes = newColumnTypes;
        this.width = newWidth;
    }

    /**
     * Build field index map for quick lookups
     */
    buildFieldIndexMap() {
        this.fieldIndexMap.clear();
        this.rawTable[0].forEach((fieldName, index) => {
            this.fieldIndexMap.set(fieldName, index);
        });
    }

    /**
     * Group rows by the specified field
     */
    group(groupByField, allowDuplicateFields, groupMethod) {
        if (!groupByField) return;

        if (groupMethod === GroupMethod.EXPAND_INTO_COLUMNS) {
            this.expandRowsIntoColumns(groupByField, allowDuplicateFields);
        } else if (groupMethod === GroupMethod.COMMAS) {
            this.concatenateGroup(groupByField, allowDuplicateFields);
        }
        // If groupMethod === GroupMethod.NONE, do nothing
    }

    /**
     * Expand duplicate values into separate columns
     */
    expandRowsIntoColumns(groupByField, allowDuplicateFields) {
        const groupColIndex = this.fieldIndexMap.get(groupByField);
        if (groupColIndex === undefined) return;

        // Build a map: key -> list-of-lists (column -> values)
        const keyData = new Map();

        for (let row = 1; row < this.rawTable.length; row++) {
            const key = String(this.rawTable[row][groupColIndex] || '');
            if (!keyData.has(key)) {
                keyData.set(key, Array.from({ length: this.width }, () => []));
            }
            const colLists = keyData.get(key);
            for (let col = 0; col < this.width; col++) {
                const val = String(this.rawTable[row][col] || '');
                if (val) {
                    const fieldName = this.rawTable[0][col];
                    const dupAllowed = allowDuplicateFields.has(fieldName);
                    // Only allow multiple values for fields in allowDuplicateFields
                    if (col === groupColIndex) {
                        if (!colLists[col].includes(val)) {
                            colLists[col].push(val);
                        }
                    } else if (dupAllowed) {
                        // Always push, even if duplicate
                        colLists[col].push(val);
                    } else {
                        // Only push the first unique value
                        if (colLists[col].length === 0) {
                            colLists[col].push(val);
                        }
                    }
                }
            }
        }

        // Determine max duplicates per column (only expand if allowed)
        const maxDupByCol = Array.from({ length: this.width }, (_, col) => {
            if (col === groupColIndex) return 1;
            const fieldName = this.rawTable[0][col];
            if (!allowDuplicateFields.has(fieldName)) return 1;
            let max = 1;
            for (const colLists of keyData.values()) {
                max = Math.max(max, colLists[col].length);
            }
            return max;
        });

        // Build new headers and column types
        const newHeaders = [];
        const newColumnTypes = [];
        for (let col = 0; col < this.width; col++) {
            const baseHeader = this.rawTable[0][col];
            const colType = this.tableColumnTypes[col];
            if (col === groupColIndex) {
                newHeaders.push(baseHeader);
                newColumnTypes.push(colType);
            } else if (allowDuplicateFields.has(baseHeader)) {
                for (let k = 0; k < maxDupByCol[col]; k++) {
                    newHeaders.push(k === 0 ? baseHeader : `${this.getOrdinal(k + 1)} ${baseHeader}`);
                    newColumnTypes.push(colType);
                }
            } else {
                newHeaders.push(baseHeader);
                newColumnTypes.push(colType);
            }
        }

        // Build new table
        const newWidth = newHeaders.length;
        const newHeight = keyData.size;
        const newTable = [];
        newTable.push(newHeaders);
        for (const [key, colLists] of keyData) {
            const newRow = [];
            for (let col = 0; col < this.width; col++) {
                if (col === groupColIndex) {
                    newRow.push(key);
                } else if (allowDuplicateFields.has(this.rawTable[0][col])) {
                    const maxCount = maxDupByCol[col];
                    for (let k = 0; k < maxCount; k++) {
                        newRow.push(colLists[col][k] || '');
                    }
                } else {
                    newRow.push(colLists[col][0] || '');
                }
            }
            newTable.push(newRow);
        }

        this.rawTable = newTable;
        this.tableColumnTypes = newColumnTypes;
        this.width = newWidth;
        this.height = newHeight;
        this.buildFieldIndexMap();
    }

    /**
     * Concatenate group values with commas
     */
    concatenateGroup(groupByField, allowDuplicateFields) {
        const groupColIndex = this.fieldIndexMap.get(groupByField);
        if (groupColIndex === undefined) return;

        const keyRowMap = new Map();
        const groupedDataRows = [];

        for (let row = 1; row < this.rawTable.length; row++) {
            const key = String(this.rawTable[row][groupColIndex] || '');

            if (!keyRowMap.has(key)) {
                // First time seeing this key - copy row as-is
                const newRow = [...this.rawTable[row]];
                keyRowMap.set(key, groupedDataRows.length);
                groupedDataRows.push(newRow);
            } else {
                // Merge with existing row
                const existingRowIdx = keyRowMap.get(key);
                const existingRow = groupedDataRows[existingRowIdx];

                for (let col = 0; col < this.width; col++) {
                    if (col === groupColIndex) continue; // Don't touch the key column

                    const existingValue = String(existingRow[col] || '');
                    const newValue = String(this.rawTable[row][col] || '');

                    if (!newValue) continue;

                    if (!existingValue) {
                        existingRow[col] = newValue;
                    } else {
                        const fieldName = this.rawTable[0][col];
                        const dupAllowed = allowDuplicateFields.has(fieldName);
                        
                        if (dupAllowed) {
                            // Always append, even if duplicate
                            existingRow[col] = `${existingValue}, ${newValue}`;
                        } else {
                            // Append only if distinct (case-insensitive)
                            const items = existingValue.split(',').map(s => s.trim()).filter(s => s);
                            if (!items.some(item => item.toLowerCase() === newValue.toLowerCase())) {
                                existingRow[col] = `${existingValue}, ${newValue}`;
                            }
                        }
                    }
                }
            }
        }

        // Rebuild table with header + grouped rows
        this.height = groupedDataRows.length;
        const newTable = [this.rawTable[0]]; // Keep header
        newTable.push(...groupedDataRows);

        this.rawTable = newTable;
    }

    /**
     * Get ordinal string (1st, 2nd, 3rd, etc.)
     */
    getOrdinal(n) {
        const abs = Math.abs(n);
        const lastTwo = abs % 100;
        if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
        switch (abs % 10) {
            case 1: return `${n}st`;
            case 2: return `${n}nd`;
            case 3: return `${n}rd`;
            default: return `${n}th`;
        }
    }

    /**
     * Get the table data as an array of objects
     */
    toObjectArray() {
        if (this.rawTable.length === 0) return [];

        const headers = this.rawTable[0];
        return this.rawTable.slice(1).map(row => {
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index];
            });
            return obj;
        });
    }

    /**
     * Get the raw table data
     */
    getRawTable() {
        return this.rawTable;
    }

    /**
     * Get table dimensions
     */
    getDimensions() {
        return {
            width: this.width,
            height: this.height
        };
    }

    /**
     * Get number of rows (matches C# Number_Of_Rows property)
     */
    get numberOf_Rows() {
        return this.height;
    }

    /**
     * Get number of columns (matches C# Number_Of_Columns property)
     */
    get numberOf_Columns() {
        return this.width;
    }

    /**
     * Get field data types (matches C# GetFieldDataTypes method)
     */
    getFieldDataTypes() {
        return this.tableColumnTypes.slice(); // Return a copy
    }

    /**
     * Get column headers
     */
    getHeaders() {
        return this.rawTable.length > 0 ? this.rawTable[0] : [];
    }

    /**
     * Add post-processing filters (applied after grouping)
     */
    addPostFilter(fieldName, operator, values) {
        // Create a simple filter group for post-processing
        const filter = new Filter(fieldName, operator, values);
        const filterGroup = new FilterGroup(LogicalOperator.AND, [filter]);
        
        // Apply filter to current data
        const filteredRows = [];
        for (let row = 1; row < this.rawTable.length; row++) {
            if (this.rowPassesFilterGroup(this.rawTable[row], filterGroup)) {
                filteredRows.push(this.rawTable[row]);
            }
        }

        // Rebuild table
        this.rawTable = [this.rawTable[0], ...filteredRows];
        this.height = filteredRows.length;
    }

    /**
     * Change grouping method and re-process
     */
    changeGroupMethod(newGroupMethod) {
        if (this.groupMethod === newGroupMethod) return;

        this.groupMethod = newGroupMethod;
        
        // Re-create table from original data
        this.createRawTable();
        this.reorderTable();
        this.buildFieldIndexMap();

        // Re-apply grouping with new method
        if (this.groupByField) {
            this.group(this.groupByField, this.allowDuplicateFields, this.groupMethod);
        }
    }

    /**
     * Change the grouping field and re-process
     */
    changeGroupByField(newGroupByField) {
        this.groupByField = newGroupByField;
        
        // Re-create table from original data
        this.createRawTable();
        this.reorderTable();
        this.buildFieldIndexMap();

        // Apply grouping with new field
        if (this.groupByField) {
            this.group(this.groupByField, this.allowDuplicateFields, this.groupMethod);
        }
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.SimpleTable = SimpleTable;
    window.GroupMethod = GroupMethod;
    window.FilterOperator = FilterOperator;
    window.LogicalOperator = LogicalOperator;
    window.Filter = Filter;
    window.FilterGroup = FilterGroup;
    window.FieldSpec = FieldSpec;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SimpleTable,
        GroupMethod,
        FilterOperator,
        LogicalOperator,
        Filter,
        FilterGroup,
        FieldSpec
    };
}
