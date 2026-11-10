# Tests actually run

All results below come from the last run in the build environment (Node 22, Chromium via Playwright, Linux). Nothing is extrapolated.

| Suite | Command | Result |
|---|---|---|
| TypeScript strict typecheck | `npm run typecheck` | ✅ 0 errors (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`) |
| Unit + integration (vitest) | `npm test` | ✅ **36 / 36** |
| Performance benchmark | `npm run bench` | ✅ within budget (numbers below) |
| End-to-end, real app in Chromium (desktop + phone) | `npm run e2e` | ✅ **51 / 51**, 0 runtime errors |
| Plugin entry vs Obsidian API mock | `node tests/e2e/plugin.e2e.mjs` | ✅ **16 / 16**, 0 runtime errors |
| Real Obsidian | — | ⚠️ **not run**: launching the Obsidian binary wasn't permitted in this environment (see LIMITATIONS) |

## Unit / integration (`tests/core.test.ts`, `tests/store-actions.test.ts`)
- Task parser: emoji and Dataview syntax, statuses, block ids, code-block exclusion, format/parse round-trip, recurrence (incl. month-end, weekdays).
- Schema: duration parsing, worklog sections (DE + EN headings), kind detection by folder/type, validation warnings, link targets.
- Dates: ISO weeks (incl. week 53), month arithmetic, invalid dates.
- YAML emitter round-trips through a real YAML parser.
- Section insertion (`insertUnderHeading`) for all edge cases.
- Settings migration (unknown widgets dropped, new widgets appended, user order kept).
- Quick-add parser (EN/DE dates, weekdays, `20.11.`, relative, priority, project prefix, recurrence, unknown `@mentions` untouched).
- Store: indexing, project resolution via file and link, duplicate-id detection.
- Honest progress: project progress excludes milestones; a goal with no data returns `null`; metric goals compute `current/target`.
- Actions: complete task → block id + done date + **backup file** + undo + redo; **refuses to write when the line changed on disk**; finds stable tasks after lines moved; recurring task creates the next occurrence; add task under the project's `## Tasks`; create never overwrites (`VLAN 2.md`) and ids are unique; frontmatter undo; idempotent daily/review creation.
- Worklogs: weekly summary, Ausbildungsnachweis excludes `private` entries, hours/days line, skills.
- Knowledge: related notes with reasons; search by title, tag, full text, task text, fuzzy title.

## Performance (`tests/performance.test.ts`) — synthetic vault: 5,000 notes, 300 projects, 9,000 tasks, 1,000 worklogs
| Measure | Result | Budget |
|---|---|---|
| Full index incl. all bodies (in-memory port) | 222 ms | — |
| Snapshot rebuild (uncached) | 6.9 ms | < 250 ms |
| Snapshot (cached) | < 0.1 ms | < 1 ms |
| Full-text search, 2 terms | 20.8 ms | < 60 ms |
| Fuzzy title search | 7.4 ms | < 60 ms |
| All dashboard queries | 16.3 ms | < 400 ms |
| Smart connections for one note | 10.2 ms | — |
| Incremental update (edit 1 file → reindex → snapshot) | 9.6 ms | < 150 ms |

*metaParse* (≈400 ms) measures the test port's YAML parsing, which Obsidian's metadata cache does natively, so it doesn't apply in Obsidian.

Page render times on the demo vault (Chromium, measured in e2e): Home 15 ms, Today 10, Tasks 6, Worklogs 12, Knowledge 7, Projects 4, Goals 4, Learning 18, Journal 9, Reviews 3, Archive 2.

## End-to-end (`tests/e2e/preview.e2e.mjs`) — real AppShell, store and actions
1–22. Every page renders in dark **and** light mode without error boxes or runtime errors (11 pages × 2).
23. The dashboard focus card shows the daily note's focus.
24. All 9 widgets are present.
25. Completing a task from the dashboard changes the done count; `Ctrl+Z` undoes it.
26. Quick capture `E2E Testaufgabe tomorrow !high @Netzwerk` → due tomorrow, high priority, linked to the project; the file line format is checked.
27. `Ctrl+K` full-text search for "broadcast" finds the *VLAN* note; Enter opens the reader.
28. The context panel shows backlinks and smart connections.
29. The worklog form creates an entry with 2h 15m, 2 technologies and 2 learned items, then opens it.
30. Project task board: drag *To do → In progress* updates the Markdown file.
31. Projects board renders 4 status columns; the timeline renders.
32. Worklog calendar, week and skills views plus the export render; **the private entry doesn't leak into the export**.
33. Daily review: 3 steps, save → review note written, tomorrow's focus set.
34. Goal metric `+1` updates `current` and appends to `## Verlauf`.
35. Dashboard customise: hiding a widget works and persists to settings.
36. Keyboard chords `G T`, `G P` and `Alt+←` back navigation.
37. Capture modal and command palette render.
38. 720 px width: no horizontal overflow (found and fixed a real grid bug).
39. `prefers-reduced-motion`: no running animations after navigation.
40. Page render < 50 ms on the demo vault.
41–42. The Appearance page renders in dark and light.
43. **Scroll position**: on a 390 px phone viewport, scroll to the habits widget, tick a habit → scroll position unchanged (±2 px) and the habit is saved.
44. Phone viewport: navigation is the sidebar by default (bottom bar off); the menu button opens it, tapping outside and choosing a destination close it. Appearance: theme *Midnight*, background *Aurora* and glass apply live (data attributes, `backdrop-filter` active). The bottom bar is visible, navigates and shows the active item; the *More* sheet lists all sections.
45. Light mode + custom accent `#e0603a` resolves to the exact accent variable; desktop glass screenshots.

## Mobile end-to-end (390×844, touch, `body.is-mobile`, simulated Obsidian element styles)
46. Every page: no horizontal overflow; every text input, textarea and select ≥ 16 px (no iOS zoom).
47. Swipe right on a task arms the action and completes it; swipe left on another moves it to tomorrow (checked in the Markdown-backed store).
48. Long-press opens the action sheet with rows ≥ 48 px; Escape closes it.
49. Top bar: compact title hidden at the top and visible after scrolling; in the note reader the page actions collapse into one ⋯ button and the title keeps > 120 px.
50. Worklog calendar: tapping a day shows its entries.
51. Sidebar opens by edge swipe and closes by swiping it away.

## Plugin entry (`tests/e2e/plugin.e2e.mjs`) — `main.ts` + `obsidian-mock.ts`
`onload` runs without errors · the view opens on startup · 16 commands registered · immersive body classes set · sidebars collapsed · dashboard renders with data · opening a note removes immersive mode · the editor gets a *Back to Second Brain* action · **the app tab isn't replaced by the editor** (found and fixed) · task write through `vault.process` · backup through `vault.adapter` · settings persisted through `saveData` · scaffold command runs · **`obsidian://second-brain` links**: `add=task` with quick-add syntax (due tomorrow, high priority), `add=idea`, `route` + prefilled `capture`.

## Bugs found by these tests and fixed
- **Shadow of the closed phone sidebar darkened the left ~40 px of every screen** (visible on light buttons) → shadow only while open (same for the context panel).
- iOS/WebKit native form-control appearance → `appearance: none` for app buttons and inputs.
- Hover styles stuck after taps on touch screens → at build time every `:hover` rule is wrapped in `@media (hover: hover)`.
- Plugin test mock lacked `registerObsidianProtocolHandler` (the real API has it) → added, so the URI handler is now exercised.
- **Scroll jumped to the top after in-place updates (e.g. ticking a habit on iOS)**: the page was emptied before re-rendering, so the scroll height briefly collapsed. Now the new page is built off-DOM and swapped in one step, entrance animations are muted during such updates, and the scroll position is re-applied after layout.
- Tapping the label of a switch row didn't toggle it → the whole row is now the tap target.
- Phone sidebar overlay sat under its dimming layer (a background-layer rule outranked the mobile rules) → zero-specificity rule; sidebar items are tappable again.
- **Obsidian's global button styles** (`button:not(.clickable-icon)`) overrode app controls: grey pill buttons, collapsed theme/background previews, grey accent dots. Fix: at build time every app selector is raised to `.sbos-root.sbos-root …` and a neutral element reset sits in between (`scripts/css-scope.mjs`). The preview now loads `preview/obsidian-sim.css`, an approximation of Obsidian's element rules, *before* the app CSS, and e2e test 44 asserts that no app button shows the host button colour.
- Primary buttons rendered without a visible label (a CSS reset outweighed the button colour) → resets moved into `:where()`.
- Narrow layout: the workspace was placed into a 0 px grid column once the sidebar became an overlay → explicit grid placement.
- Typing immediately after `Ctrl+K` / `C` could lose keystrokes (focus was set on the next frame) → focus set synchronously.
- *Edit* would have replaced the app tab with the editor → reuse an editor tab or open a new one.
- Worklog titles repeated the date prefix → titles come from `title`, then the first `# heading`, then the filename without the date.

## Test data
All demo files carry `sbos-testdata: true`; there are 61 generated by `scripts/seed-demo.mjs`. Remove them in Obsidian with *Second Brain OS: Remove demo / test data* or `node scripts/seed-demo.mjs --clean`. Neither touches any file without that flag.

Screenshots from the last e2e run are written to `Development/tests/e2e/screenshots/` (not committed; regenerate with `npm run e2e`).
