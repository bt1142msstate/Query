import assert from 'node:assert/strict';

globalThis.window = globalThis;

const {
  Filter,
  FilterGroup,
  FilterOperator,
  GroupMethod,
  LogicalOperator,
  SimpleTable
} = await import('../../table/virtual-table/simpleTable.js');

const tableConfig = {
  DataLines: [
    'Alpha|Main|10|tag1',
    'Beta|Main|7|tag2',
    'Gamma|East|2|tag1',
    'Delta|West|20|tag3'
  ],
  RawColumnOrder: [
    { FieldName: 'Title', RawOutputSegments: 1, DataType: 'string' },
    { FieldName: 'Branch', RawOutputSegments: 1, DataType: 'string' },
    { FieldName: 'Copies', RawOutputSegments: 1, DataType: 'int' },
    { FieldName: 'Tag', RawOutputSegments: 1, DataType: 'string' }
  ],
  DesiredColumnOrder: ['Branch', 'Title', 'Copies', 'Tag'],
  Filters: [
    { FieldName: 'Copies', FieldOperator: FilterOperator.GREATER_THAN, Values: ['5'] }
  ],
  GroupByField: 'Branch',
  AllowDuplicateFields: ['Title'],
  GroupMethod: GroupMethod.EXPAND_INTO_COLUMNS
};

const groupedTable = new SimpleTable(tableConfig);

assert.deepEqual(groupedTable.getHeaders(), ['Branch', 'Title', '2nd Title', 'Copies', 'Tag']);
assert.equal(groupedTable.numberOf_Rows, 2);
assert.equal(groupedTable.numberOf_Columns, 5);
assert.deepEqual(groupedTable.getRawTable(), [
  ['Branch', 'Title', '2nd Title', 'Copies', 'Tag'],
  ['Main', 'Alpha', 'Beta', '10', 'tag1'],
  ['West', 'Delta', '', '20', 'tag3']
]);

groupedTable.changeGroupMethod(GroupMethod.COMMAS);
assert.deepEqual(groupedTable.getHeaders(), ['Branch', 'Title', 'Copies', 'Tag']);
assert.deepEqual(groupedTable.getRawTable(), [
  ['Branch', 'Title', 'Copies', 'Tag'],
  ['Main', 'Alpha, Beta', '10, 7', 'tag1, tag2'],
  ['West', 'Delta', 20, 'tag3']
]);

groupedTable.addPostFilter('Title', FilterOperator.CONTAINS, ['beta']);
assert.deepEqual(groupedTable.getRawTable(), [
  ['Branch', 'Title', 'Copies', 'Tag'],
  ['Main', 'Alpha, Beta', '10, 7', 'tag1, tag2']
]);

const explicitOrGroup = new FilterGroup(LogicalOperator.OR, [
  new Filter('Branch', FilterOperator.EQUALS, 'Main'),
  new Filter('Copies', FilterOperator.GREATER_THAN_OR_EQUAL, '20')
]);
const ungroupedTable = new SimpleTable({
  ...tableConfig,
  Filters: [],
  GroupByField: '',
  GroupMethod: GroupMethod.NONE
});

assert.equal(ungroupedTable.rowPassesFilterGroup(['Main', 'Alpha', 10, 'tag1'], explicitOrGroup), true);
assert.equal(ungroupedTable.rowPassesFilterGroup(['East', 'Gamma', 2, 'tag1'], explicitOrGroup), false);

console.log('SimpleTable logic tests passed');
