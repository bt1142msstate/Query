Query is an open-source tool for building complex list item reports from library data. Designed for library staff, data analysts, and developers, Query makes it easy to construct and customize your library reports.

⸻

Key Features

🧩 Visual Query Building

Add columns and filters with intuitive “field bubbles”—just click to add or remove fields and filters. Instantly rearrange your report by dragging column headers in the dynamic table to get the exact layout you want.

📄 Excel File Output

Generate Excel (.xlsx) files directly from your custom queries—ideal for reporting, sharing, and further data analysis.

🔌 Backend Integration

Connect Query with your backend: send and receive JSON between the builder and your server, making it easy to generate item reports and integrate with your library system.

📁 Templates & Query History

Save, reuse, and manage query templates. Access your query history for quick modifications and repeat reports.

🛠️ MARC Field Support

Add and filter on any MARC field (assuming your system supports the MARC standard). Group multiple MARC field values into a single column (e.g., value1, value2), or separate them into individual columns (e.g., Marc590, 2nd Marc590).

🤖 AI Support (Coming Soon)

Integrate Query with external AI services—including ChatGPT and more—to enhance report building and query generation with intelligent suggestions and natural language processing.

♿ Accessible by Design

Enjoy full keyboard navigation and ARIA support for enhanced accessibility.

📱 Mobile Support Coming Soon

A responsive, mobile-friendly interface is on the roadmap.

⸻

Note: Query is focused solely on generating lists of items. Charting and advanced data visualizations are not currently supported.

Frontend Structure

- `core/`: app orchestration and shared state (`query.js`, `queryHistory.js`, `queryState.js`, `utils.js`)
- `ui/`: UI-only helpers and overlays (`queryUI.js`, `modalManager.js`, `toast.js`, `tooltips.js`)
- `filters/`: field definitions, filter logic, payload building, and side panel (`fieldDefs.js`, `filterManager.js`, `filterSidePanel.js`, `queryPayload.js`)
- `table/`: table rendering, export, columns, and drag/drop (`simpleTable.js`, `virtualTable.js`, `excel.js`, `columnManager.js`, `dragDrop.js`)
- `bubbles/`: bubble interaction system (`bubble.js`)

Script load order is still controlled by `index.html`, so files should be moved between folders only when their script path is updated there.
