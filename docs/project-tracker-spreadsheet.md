# Project Tracker spreadsheet

The Project Tracker uses a project-owned spreadsheet renderer. No third-party spreadsheet UI is involved.

## Data ownership

- `ProjectTrackerRow`, `ProjectTrackerColumn`, and `ProjectTrackerCell` remain the source of truth for tracker records, Flux links, local overrides, Bin recovery, permissions, and audit history.
- `ProjectTracker.settings.spreadsheet` stores versioned workbook presentation state: sparse free-form cells, formulas, styles, dimensions, sheets, merges, filters, freeze panes, validation, conditional formats, and notes.
- The primary worksheet is an adapter over the normalized tracker records. Its first row contains tracker column names; subsequent database-backed coordinates map to row and column IDs rather than becoming a second record store.
- Secondary sheets and cells outside the normalized tracker area live only in the sparse workbook.

## Legacy migration

Older tracker settings are read through a one-way compatibility adapter. The first successful custom-workbook autosave writes version 2 under `settings.spreadsheet` and removes the retired settings key. Database rows, columns, cells, links, Bin entries, and activities are not migrated or rewritten.

The adapter retains legacy values, formulas, common font/fill/alignment/number styles, comments, dimensions, hidden rows/columns, merges, and freeze panes where those values were present in the stored JSON.

## XLSX support

ExcelJS 4.4.0 (MIT) handles styled multi-sheet XLSX input and output. The existing SheetJS Community Edition dependency remains as a fallback reader for legacy XLS, CSV, and XML imports. Both libraries are data codecs only; neither renders the spreadsheet.

Supported XLSX round-trip data includes worksheet names, values, formulas and cached results, common fonts/fills, alignment, borders, number formats, row heights, column widths, hidden rows/columns, merges, freeze panes, list validation, comments, and basic autofilters.

Macros, charts, images, pivot tables, external connections, advanced table styling, protected/encrypted workbooks, rich-text runs, and advanced Excel conditional formatting are not reproduced. Import reports concise warnings for detectable unsupported objects instead of claiming preservation.

## Performance

Cells use serializable sparse storage keyed by `row:column`. The default canvas is 1,000 rows by 100 columns, while the DOM contains only visible rows and columns plus a small overscan and frozen panes. Cell edit history stores cell patches; complete workbook snapshots are reserved for infrequent workbook-level operations such as adding or deleting sheets.

