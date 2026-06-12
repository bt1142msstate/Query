# Reusable Frontend Components

The app is still a static, buildless browser application, but several pieces are now exposed through stable ES module entrypoints so they can be reused by another website without importing feature coordinators or app-shell code.

Use these public component entrypoints for outside integrations:

```js
import {
  createVirtualTableComponent,
  createWorkbookExportComponent,
  CustomDatePicker,
  Tooltips
} from './src/components/index.js';
```

Do not import from `src/features/...` in another site unless you are intentionally working on this app. The feature folders remain implementation internals and can change as the app evolves.

## Virtual Table

Entrypoint:

```js
import { createVirtualTableComponent } from './src/components/virtual-table/index.js';
```

The virtual-table component is a headless data projection layer. It keeps the reusable behavior separate from this app's DOM shell:

- normalizes headers, rows, and column maps
- expands JSON-array or serialized multi-value cells into numbered split columns
- collapses duplicate rows based on the currently displayed columns
- returns table data that a host site can render with its own UI

Example:

```js
const table = createVirtualTableComponent({
  data: {
    headers: ['Title', 'Public Note'],
    rows: [
      ['Alpha', ['First note', 'Second note']],
      ['Alpha', ['First note', 'Second note']]
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Public Note', 1]
    ])
  },
  displayedFields: ['Title', 'Public Note'],
  splitColumns: false,
  collapseDuplicateRows: true
});

const projection = table.project();
console.log(projection.tableData.rows.length);

table.setSplitColumns(true);
console.log(table.displayedFields);
```

This entrypoint does not mount a table by itself. It is intentionally usable in any UI framework or plain DOM page.

## Workbook Export

Entrypoint:

```js
import { createWorkbookExportComponent } from './src/components/workbook-export/index.js';
```

The workbook export component exposes the same custom XLSX generation path used by the app. It can either create a Blob for a host site to handle or trigger a browser download.

Example:

```js
const exporter = createWorkbookExportComponent({
  helpers: {
    progress: { update(message) { console.log(message); } },
    async yieldToBrowser() {}
  }
});

const { blob, filename } = await exporter.createBlob({
  config: { mode: 'single' },
  state: {
    tableName: 'Report',
    rowCount: 1,
    groupingCandidates: [],
    sourceData: {
      displayedFields: ['Title', 'Public Note'],
      dataRows: [['Alpha', ['First note', 'Second note']]],
      fieldTypeMap: new Map([
        ['Title', 'string'],
        ['Public Note', 'string']
      ]),
      virtualData: {
        columnMap: new Map([
          ['Title', 0],
          ['Public Note', 1]
        ])
      }
    }
  }
});

console.log(filename, blob.type);
```

`createBlob()` is the preferred integration point when another site already has its own download UI, progress modal, or file handoff. `download()` uses the app's browser download helper.

## Date Picker

Entrypoint:

```js
import { CustomDatePicker } from './src/components/date-picker/index.js';
```

`CustomDatePicker.enhanceInput(input, options)` upgrades a text input with the shared date picker, manual date parsing, and the `Never` date option. It is DOM-bound, so call it only in a browser after the input exists.

Example:

```js
const input = document.querySelector('#due-date');
CustomDatePicker.enhanceInput(input, {
  allowNever: true,
  placeholder: 'M/D/YYYY',
  variant: 'filter'
});
```

The date component also re-exports shared date helpers such as `normalizeDateValue`, `toBackendDateValue`, and `DATE_INPUT_PATTERN`.

## Tooltips

Entrypoint:

```js
import { Tooltips, buildFieldTooltipHtml, buildFilterTooltipHtml } from './src/components/tooltips/index.js';
```

`Tooltips` is browser-safe to import from tests or server-side tooling. In a browser, it attaches delegated tooltip behavior once and can be called again idempotently.

Supported markup:

```html
<button data-tooltip="Refresh results">Refresh</button>
<button data-tooltip-html="<strong>Filterable</strong>">Field info</button>
```

Useful methods:

- `Tooltips.attach()`
- `Tooltips.forceHide()`
- `Tooltips.isVisible()`

Use `buildFieldTooltipHtml()` and `buildFilterTooltipHtml()` when a host site wants the same field/filter tooltip formatting without copying formatter logic.

## Compatibility Notes

- These entrypoints are native ES modules. Use them from an HTTP-served page, not from `file://`.
- The project does not publish a packaged npm library yet. Relative imports from the repo are the supported path today.
- `package.json` declares `exports` for the component entrypoints so a future package publish can keep the same public surface.
- The component tests live in `tests/unit/components/` and should be updated when public component behavior changes.
