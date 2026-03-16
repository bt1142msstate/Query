<div align="center">

# 📊 Sirsi Query Project

A browser-based report builder for library data.


</div>

Sirsi Query Project brings report building, guided forms, query history, and export workflows into one browser UI. It is designed to be useful now while steadily moving toward cleaner backend boundaries that make future migrations easier.

> [!NOTE]
> 💡 This project is intentionally being shaped to work with multiple backend implementations over time. Migration friendliness is an explicit product goal, not an afterthought.

## 📌 At a Glance

| Area | What it gives you |
| --- | --- |
| Bubble builder | Visual field selection and interactive filtering |
| Form mode | Focused, URL-driven reporting flows for staff workflows |
| Query history | Reload, rerun, cancel, and inspect past or active runs |
| Query JSON | Visibility into the query payload being assembled |
| Results | Large-table rendering and Excel export support |

## ❓ Why It Exists

Library reporting workflows often sprawl across separate tools and separate habits. This project pulls those needs into one place so teams can:

- ⚡ build ad hoc reports quickly
- 🔄 switch between exploratory and guided workflows
- ⏪ revisit earlier runs without rebuilding them manually
- 📥 export results for downstream analysis

## 💻 Main Experience

### 🔍 Bubble Builder

The default mode is a visual builder for choosing output fields and applying filters.

### 📜 Query History

Past and in-flight queries can be reviewed from a dedicated history panel with status-aware actions.

### 📋 Query JSON

The app exposes the current payload so it can be reviewed, validated, and debugged.

### 📝 Form Mode

A guided mode can be generated from a URL-encoded form specification. This is useful when users should fill in a smaller, curated set of inputs instead of working in the full builder.

## 📁 Repository Layout

| Path | Purpose |
| --- | --- |
| `Query Website/` | Main frontend application |
| `Query Website/bubbles/` | Bubble builder rendering and interaction |
| `Query Website/core/` | Query execution, state, history, and utilities |
| `Query Website/filters/` | Field definitions and filter payload logic |
| `Query Website/table/` | Result rendering, column behavior, and export helpers |
| `Query Website/ui/` | Form mode, modals, toasts, and shared UI helpers |
| `Query Website/styles/` | Feature-oriented CSS |
| `Documentation/` | Internal notes, examples, and implementation docs |

## 🛠️ Tech Approach

- 🌐 static frontend built with HTML, CSS, and vanilla JavaScript
- ⚡ no required frontend build step for the main app
- 🧩 feature-oriented organization rather than framework-heavy abstraction
- 🔀 shared state and UI utilities that support both bubble mode and form mode

## 🚀 Running Locally

The main app is a static site.

1. Serve the `Query Website` directory from a local static server.
2. Open the app through that server rather than directly from the filesystem.
3. Connect the frontend to a compatible backend environment.

> [!TIP]
> 🚧 If you are evaluating the project architecture, the main thing to know is that the frontend is being pushed toward a clearer contract layer so the UI can migrate more cleanly between backends.

## 📄 Form Mode, Briefly

Form mode is driven by a URL parameter containing an encoded JSON spec. A form spec can define:

- 🏷️ title and description
- 🎯 default query name
- 📊 output columns
- ✏️ editable inputs
- 🔒 locked filters

That lets the same application support both open-ended exploration and narrow operational workflows.

## 🛣️ Project Direction

Near-term priorities are centered on portability and maintainability:

- 🔌 make backend integration points clearer and easier to swap
- ✂️ continue reducing coupling between UI behavior and backend-specific assumptions
- 🤝 improve shared field-definition workflows
- 💾 preserve compatibility for saved queries as the data model evolves

## 🔮 Future Features

- 🤖 optional sign-in with a preferred AI provider, such as Gemini or ChatGPT, so users can get help turning reporting needs into queries
- 🏗️ continued work to make backend migration easier and less disruptive

## 👥 Intended Audience

This project is aimed at teams who need a practical reporting UI for library workflows and want something that can evolve instead of locking them into one long-term backend shape.
