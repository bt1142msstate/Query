function createColumnValueBuckets(width) {
    return Array.from({ length: width }, () => []);
}

function appendExpandedColumnValue({ bucket, isGroupColumn, duplicatesAllowed, value }) {
    if (!value) {
        return;
    }

    if (isGroupColumn) {
        if (!bucket.includes(value)) {
            bucket.push(value);
        }
        return;
    }

    if (duplicatesAllowed) {
        bucket.push(value);
        return;
    }

    if (bucket.length === 0) {
        bucket.push(value);
    }
}

function collectExpandedGroupData({ rawTable, width, groupColIndex, allowDuplicateFields }) {
    const keyData = new Map();
    const headers = rawTable[0];

    for (let row = 1; row < rawTable.length; row += 1) {
        const key = String(rawTable[row][groupColIndex] || '');
        if (!keyData.has(key)) {
            keyData.set(key, createColumnValueBuckets(width));
        }

        const colLists = keyData.get(key);
        for (let col = 0; col < width; col += 1) {
            appendExpandedColumnValue({
                bucket: colLists[col],
                duplicatesAllowed: allowDuplicateFields.has(headers[col]),
                isGroupColumn: col === groupColIndex,
                value: String(rawTable[row][col] || '')
            });
        }
    }

    return keyData;
}

function getMaxDuplicatesByColumn({ keyData, headers, width, groupColIndex, allowDuplicateFields }) {
    return Array.from({ length: width }, (_, col) => {
        const fieldName = headers[col];
        if (col === groupColIndex || !allowDuplicateFields.has(fieldName)) {
            return 1;
        }

        let max = 1;
        for (const colLists of keyData.values()) {
            max = Math.max(max, colLists[col].length);
        }
        return max;
    });
}

function buildExpandedHeaders({ headers, columnTypes, width, groupColIndex, allowDuplicateFields, maxDupByCol, getOrdinal }) {
    const newHeaders = [];
    const newColumnTypes = [];

    for (let col = 0; col < width; col += 1) {
        const baseHeader = headers[col];
        const colType = columnTypes[col];
        const duplicateCount = allowDuplicateFields.has(baseHeader) ? maxDupByCol[col] : 1;

        if (col === groupColIndex) {
            newHeaders.push(baseHeader);
            newColumnTypes.push(colType);
            continue;
        }

        for (let index = 0; index < duplicateCount; index += 1) {
            newHeaders.push(index === 0 ? baseHeader : `${getOrdinal(index + 1)} ${baseHeader}`);
            newColumnTypes.push(colType);
        }
    }

    return { newHeaders, newColumnTypes };
}

function buildExpandedRows({ keyData, headers, width, groupColIndex, allowDuplicateFields, maxDupByCol }) {
    const rows = [];

    for (const [key, colLists] of keyData) {
        const newRow = [];
        for (let col = 0; col < width; col += 1) {
            if (col === groupColIndex) {
                newRow.push(key);
                continue;
            }

            if (allowDuplicateFields.has(headers[col])) {
                for (let index = 0; index < maxDupByCol[col]; index += 1) {
                    newRow.push(colLists[col][index] || '');
                }
                continue;
            }

            newRow.push(colLists[col][0] || '');
        }
        rows.push(newRow);
    }

    return rows;
}

function expandTableRowsIntoColumns({ rawTable, tableColumnTypes, fieldIndexMap, groupByField, allowDuplicateFields, getOrdinal }) {
    const groupColIndex = fieldIndexMap.get(groupByField);
    if (groupColIndex === undefined) {
        return null;
    }

    const width = rawTable[0].length;
    const headers = rawTable[0];
    const keyData = collectExpandedGroupData({
        rawTable,
        width,
        groupColIndex,
        allowDuplicateFields
    });
    const maxDupByCol = getMaxDuplicatesByColumn({
        keyData,
        headers,
        width,
        groupColIndex,
        allowDuplicateFields
    });
    const { newHeaders, newColumnTypes } = buildExpandedHeaders({
        headers,
        columnTypes: tableColumnTypes,
        width,
        groupColIndex,
        allowDuplicateFields,
        maxDupByCol,
        getOrdinal
    });
    const rows = buildExpandedRows({
        keyData,
        headers,
        width,
        groupColIndex,
        allowDuplicateFields,
        maxDupByCol
    });

    return {
        height: keyData.size,
        rawTable: [newHeaders, ...rows],
        tableColumnTypes: newColumnTypes,
        width: newHeaders.length
    };
}

function getMergedCommaValue({ existingRawValue, fieldName, newRawValue, allowDuplicateFields }) {
    const existingValue = String(existingRawValue || '');
    const newValue = String(newRawValue || '');

    if (!newValue) {
        return { shouldAssign: false, value: existingRawValue };
    }

    if (!existingValue) {
        return { shouldAssign: true, value: newValue };
    }

    if (allowDuplicateFields.has(fieldName)) {
        return { shouldAssign: true, value: `${existingValue}, ${newValue}` };
    }

    const items = existingValue.split(',').map(value => value.trim()).filter(Boolean);
    return items.some(item => item.toLowerCase() === newValue.toLowerCase())
        ? { shouldAssign: false, value: existingRawValue }
        : { shouldAssign: true, value: `${existingValue}, ${newValue}` };
}

function mergeCommaGroupedRow({ existingRow, incomingRow, headers, width, groupColIndex, allowDuplicateFields }) {
    for (let col = 0; col < width; col += 1) {
        if (col === groupColIndex) {
            continue;
        }

        const mergeResult = getMergedCommaValue({
            allowDuplicateFields,
            existingRawValue: existingRow[col],
            fieldName: headers[col],
            newRawValue: incomingRow[col]
        });
        if (mergeResult.shouldAssign) {
            existingRow[col] = mergeResult.value;
        }
    }
}

function concatenateTableGroups({ rawTable, fieldIndexMap, groupByField, allowDuplicateFields }) {
    const groupColIndex = fieldIndexMap.get(groupByField);
    if (groupColIndex === undefined) {
        return null;
    }

    const width = rawTable[0].length;
    const headers = rawTable[0];
    const keyRowMap = new Map();
    const groupedDataRows = [];

    for (let row = 1; row < rawTable.length; row += 1) {
        const key = String(rawTable[row][groupColIndex] || '');
        if (!keyRowMap.has(key)) {
            keyRowMap.set(key, groupedDataRows.length);
            groupedDataRows.push([...rawTable[row]]);
            continue;
        }

        mergeCommaGroupedRow({
            existingRow: groupedDataRows[keyRowMap.get(key)],
            incomingRow: rawTable[row],
            headers,
            width,
            groupColIndex,
            allowDuplicateFields
        });
    }

    return {
        height: groupedDataRows.length,
        rawTable: [headers, ...groupedDataRows]
    };
}

export {
    concatenateTableGroups,
    expandTableRowsIntoColumns
};
