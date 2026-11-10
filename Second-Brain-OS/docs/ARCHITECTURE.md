# Architecture

One core plugin with separate feature modules. There are no inter-plugin dependencies and no UI framework. A ~120-line DOM helper is enough for this UI and keeps the bundle at ~200 KB.

```
                ┌──────────────────────────── Obsidian ────────────────────────────┐
                │  Vault · MetadataCache · FileManager · Workspace · MarkdownRenderer │
                └───────────────▲───────────────────────────────────▲──────────────┘
                                │ only via                          │ ItemView
                  services/obsidian-port.ts (VaultPort)       main.ts (plugin, commands,
                                │                              settings tab, immersive mode)
        ┌───────────────────────┴────────────────────────┐            │
        │ core/                                            │            ▼
        │  store.ts     in-memory index, snapshots, events │      views/shell.ts (AppShell)
        │  actions.ts   all writes: verify · backup · undo │      ├─ sidebar · top bar · context panel
        │  schema.ts    frontmatter → validated entities   │      ├─ router + history, keyboard
        │  task-parser  checkbox lines ⇄ Task              │      └─ pages/* (one per module)
        │  queries.ts   progress, buckets, analytics,      │             ▲
        │               worklog summaries, connections     │             │ AppContext (public API)
        │  search.ts    scoring + fuzzy                    │─────────────┘
        │  quick-parse  natural-language quick add         │      ui/  dom · icons · motion ·
        │  templates    new-file content                   │           components (button, card, chips,
        └──────────────────────────────────────────────────┘           progress, charts, overlay, palette,
                                                                       capture, task-row, virtual list)
```

## Boundaries and public interfaces

| Interface | File | Contract |
|---|---|---|
| `VaultPort` | `core/ports.ts` | The **only** storage boundary. Implementations: `ObsidianPort` (official API only) and `MemoryPort` (tests, preview). |
| `DataStore` | `core/store.ts` | `init()`, `reindex(path)`, `snapshot()`, `textOf(path)`, `events.on('change')`. Snapshots are immutable and memoised per version. |
| `Actions` | `core/actions.ts` | Every write: `create`, `addTask`, `setTaskStatus/Due/Priority/Text`, `deleteTask`, `setFrontmatter`, `appendToSection`, `ensureDaily/Journal/Review`, `undo/redo`, `backup`. |
| `queries` | `core/queries.ts` | Pure functions over a `Snapshot`. Return `null` when data is insufficient. The UI shows "—" or *No measurable data yet*, never a made-up number. |
| `AppContext` | `views/context.ts` | What pages receive: `snap()`, `navigate()`, `open()`, `edit()`, `run()` (error handling + undo toast), `capture()`, `palette()`, `state()`, `refresh()`. Pages never import the store or the port directly. |
| `PageDef` | `views/context.ts` | `render(ctx, root, param)`, plus optional `context()`, `actions()`, `crumbs()`, `dispose()`. Adding a module means adding a `PageDef` to `views/pages/index.ts` and a nav entry in `views/meta.ts`. |

## Data flow
1. **Startup** (`onLayoutReady`): `listFiles()` reads metadata from Obsidian's cache, with no file reads, so the UI renders immediately. Bodies are then read in batches of 40 during idle time (`requestIdleCallback`) to fill in tasks, worklog sections and full-text search.
2. **Changes**: `metadataCache.on('changed')` / `vault.on('delete' | 'rename')` → `store.reindex(path)` for that one file → snapshot invalidated → `change` emitted (debounced 60 ms) → the shell re-renders the current page on the next animation frame, preserving scroll and focus. List changes are animated with FLIP.
3. **Writes**: `Actions` → `vault.process()` (atomic read-modify-write) or `fileManager.processFrontMatter()`. Task edits first locate the exact line: same number with identical text, then block id, then a unique identical line. Otherwise they throw a `ConflictError`, which the UI shows as a message. The first edit of a file each day writes a copy to `.sbos/backups/<date>/`. Each write pushes an undo entry, which only applies if the file is still byte-identical to what was written.

## Design system
- Tokens (`styles/tokens.css`): surfaces 0–3, hairline borders, three text levels, one accent (six choices), type scale, 4 px spacing scale, radii, motion durations (140/200/240 ms) and easings. Dark mode uses graphite tones; light mode uses warm off-white.
- Fonts: Inter (UI) and Newsreader (display / editorial), both variable, embedded as WOFF2 in `styles.css`. No network requests. System fonts cover other Unicode ranges.
- Motion (`ui/motion.ts`): Web Animations API, transform/opacity only, entrance stagger capped at 10 items, FLIP for list changes, counters via `textContent`. Turns off fully with `prefers-reduced-motion` or the *Reduce motion* setting. There are no permanent background animations. The skeleton shimmer runs only while loading.
- Layout: CSS grid shell plus container queries, so it adapts to the leaf width, not the window.

## Performance design
- Metadata-first index; bodies are loaded in the background without blocking the UI.
- Event-driven, single-file re-indexing; no vault scans after startup.
- Memoised snapshots (an uncached rebuild takes 6.5 ms for 5,000 notes).
- Debounced search (60 ms); full-text index capped at 20 KB per note.
- Virtualised lists for *All notes* and *Completed tasks* once there are more than 120 items.
- Measured numbers are in [TESTING.md](TESTING.md).

## Obsidian integration rules followed
- Only public API (`Plugin`, `ItemView`, `Vault.process`, `FileManager.processFrontMatter`, `MetadataCache`, `MarkdownRenderer`, `Workspace`).
- Immersive mode is pure CSS on body classes, active only while the app leaf is focused. It hides the ribbon, root tab headers and the status bar. Opening any note restores everything, and every Markdown view gets a *Back to Second Brain* action.
- No default hotkeys are claimed globally; all commands are in Obsidian's command palette and can be bound by the user. In-app shortcuts only apply while focus is inside the app view.
