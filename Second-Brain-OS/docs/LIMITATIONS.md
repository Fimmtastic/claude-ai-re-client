# Limitations (honest list)

## Verification
- **Not yet verified inside a real Obsidian installation.** I wasn't permitted to download and run the Obsidian binary in the build environment. What *was* verified:
  - the real app (shell, pages, store, actions) in Chromium on an in-memory vault (`tests/e2e/preview.e2e.mjs`)
  - the real plugin entry `main.ts` against an Obsidian API mock that implements the calls the plugin makes (`tests/e2e/plugin.e2e.mjs`)
  - TypeScript strict-mode compilation against the official `obsidian` type definitions (v1.8.7).

  Please treat the first launch in Obsidian as the final acceptance test. Report anything odd from the developer console (`Ctrl+Shift+I`); enable *Developer logging* in the plugin settings for timings.
- The preview harness uses a tiny Markdown renderer, so callouts and tables look plain there. Inside Obsidian the reader uses Obsidian's own `MarkdownRenderer` (callouts, tables, embeds, math, plugins' post-processors).

## Obsidian integration
- Immersive mode hides chrome via CSS classes (`.workspace-ribbon`, `.status-bar`, root `.workspace-tab-header-container`). These are long-standing, stable class names, but they're not a formal API. If a future Obsidian version renames them, the app still works; the chrome just stays visible. Turn it off under *Settings → Second Brain OS → Immersive mode*.
- On frameless macOS windows the sidebar reserves 40 px for the traffic lights; window dragging uses the sidebar top or top bar. Other window configurations weren't tested.
- The app doesn't edit inside its own view: writing happens in Obsidian's editor (one click away), by design, so every editor feature and plugin keeps working.
- Default global hotkeys aren't registered (Obsidian guideline). In-app shortcuts work while the app has focus; bind global ones yourself under *Settings → Hotkeys*.
- *Remove demo data* uses a native `confirm()` dialog.

## Data
- Links between entities are by **note name**. Two notes with the same name in different folders resolve to the first non-archived one. Obsidian handles renames when *Automatically update internal links* is on (it's on in the bundled vault).
- Unknown task status characters (e.g. `[?]`, `[>]` from other themes) are ignored rather than misinterpreted.
- Recurrence supports `every N day(s)/week(s)/month(s)/year(s)`, `every weekday` and the daily/weekly/monthly aliases. More complex rules (e.g. "every 2nd Tuesday") aren't supported.
- "Appointments" in Today are tasks with a date. There's no calendar (ICS/CalDAV) integration, to stay local-first.
- No semantic/embedding search. Smart connections are explainable metadata scores (links, backlinks, tags weighted by rarity, topic).
- In Obsidian, demo files get their realistic modification times only when generated with `scripts/seed-demo.mjs` (which sets file mtimes). A `git checkout` resets mtimes, which affects "recently edited" ordering and the activity timeline, not any stored data. Re-run the seed script (`--today` optional) after cloning for realistic demo history.
- Undo/redo holds the last 50 app changes in memory and is cleared on restart. It never overwrites a file that changed elsewhere.

## Appearance
- Liquid glass uses `backdrop-filter`. It costs GPU time and battery, especially on phones and with large blur values. Lower *Frost* or turn glass off if scrolling stutters. Glass is off by default.
- Hiding Obsidian's mobile toolbar uses its `.mobile-navbar` class (CSS only, active only while the app tab is focused). If a future Obsidian version renames it, the toolbar simply stays visible.
- "Obsidian command palette" / "New Obsidian note" in *More* call `app.commands.executeCommandById`, which isn't part of Obsidian's typed public API. The call is guarded: if it isn't available, you get a notice instead of an error.
- Custom backgrounds are loaded via `vault.getResourcePath`. Very large images (> 15 MB) are refused at upload.

## Mobile / tablet
Phones and tablets are first-class (see *Mobile* in the user guide). Verified in Chromium with a 390×844 touch viewport, simulated touch gestures and an approximation of Obsidian's element styles, **not on a physical iPhone or Android device**. Known limits:
- Drag-and-drop (project board columns, dashboard reorder) uses HTML5 drag events, which touch browsers don't send. On phones use the task's swipe/long-press menu, the project status menu, or the ↑/↓ buttons in dashboard edit mode.
- Swipe gestures need Pointer Events with `pointerType: touch` (iOS 13+, Android Chrome). On older WebViews rows still work by tap and the ⋯ menu.
- Keyboard shortcuts need a hardware keyboard (iPad keyboards work, including Escape for sheets).
- Glass blur is GPU-heavy; on touch devices the battery-friendly mode (default) blurs only bars, sidebar and sheets.
- `obsidian://second-brain` links require Obsidian to be installed and the vault name to match (`vault=` parameter). iOS may ask for confirmation the first time a Shortcut opens Obsidian.
- Backups use the vault adapter and should work on mobile, but that wasn't tested on a device.

## Not implemented (yet)
- Editing worklog body sections inside the app form after creation. Creation uses the form; later edits happen in Markdown (properties can be changed via the editor's properties panel).
- PDF export of the Ausbildungsnachweis. The export is Markdown and can be copied or saved as a note; print it to PDF from Obsidian's *Export to PDF*.
- Localised UI strings. The UI is English (as specified in the brief's navigation and actions); dates follow the *Locale* setting (default `en-GB`, set `de-DE` for German dates). Worklog headings and the training-record export are German.
