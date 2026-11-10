# Data model

Everything is **Markdown + YAML frontmatter**. The plugin never stores your content in a database; it builds an in-memory index from your files. Delete the plugin and every note is still a readable, linkable Markdown file.

## Conventions shared by all entities

| Field | Type | Notes |
|---|---|---|
| `id` | string | Created by the app (`pr-…`, `gl-…`, `wl-…`, `nt-…`, `jn-…`, `dy-…`, `rv-…`, `ln-…`, `rs-…`). Unique — duplicates are reported in the Home context panel. Files without `id` still work (a path-derived id is used in memory only). |
| `type` | `note \| project \| goal \| worklog \| journal \| daily \| review \| learning \| resource` | Optional when the file is in its default folder. |
| `created` | `YYYY-MM-DD` | Set on creation. |
| `tags` | list | Merged with inline `#tags`. |
| `area` | string | Free life area: Career, Finance, Health, Knowledge, Business, Personal, … |
| `archived` | bool | Hides the entity from active views (Archive page lists it). Files in `08-Archive/` are archived too. |
| `sbos-testdata` | bool | Marks generated demo data. *Remove demo data* deletes exactly these files. |

Links: `[[Basename]]` wikilinks everywhere. References between entities are **by note name** (Obsidian renames update them automatically with *Automatically update internal links*).

Invalid values never crash the app: they fall back to defaults and appear as **metadata warnings** (Home → context panel, and in each note's context panel).

## Project — `04-Projects/<Name>.md`

```yaml
type: project
status: active        # planned | active | paused | done | archived
priority: high        # urgent | high | medium | low | none
area: Career
start: 2026-10-17
deadline: 2026-11-28
goals: ["[[CCNA bis Jahresende]]"]
description: One sentence.
```
**Tasks belong to a project** if they are inside the project note *or* contain a `[[Project]]` link anywhere. **Milestones** are tasks tagged `#milestone`. Progress = done / (non-cancelled, top-level, non-milestone tasks); with no tasks progress is shown as “—”, never 0 %.

## Task — any checkbox line in any note

```markdown
- [ ] Configure VLAN 20 [[Netzwerk-Umbau VLAN]] #network ⏫ 🔁 every week ⏳ 2026-11-11 📅 2026-11-12 ^t-ab12cd
```

| Token | Meaning |
|---|---|
| `[ ]` `[/]` `[x]` `[-]` | todo · in progress · done · cancelled |
| `📅 date` / `[due:: date]` | due date |
| `⏳ date` / `[scheduled:: date]` | scheduled (appears in Today from that date) |
| `✅ date` | completion date (written by the app) |
| `🔺 ⏫ 🔼 🔽` / `[priority:: high]` | urgent · high · medium · low |
| `🔁 every day/week/2 weeks/month/weekday/year` | recurrence — completing creates the next occurrence above |
| `#milestone` | milestone of the containing project/goal |
| `^t-xxxxxx` | stable block id, added the first time the app edits a task |

The syntax is compatible with the popular *Tasks* plugin and with Dataview inline fields.

**Safe writes:** before changing a task the app re-reads the file and verifies the exact line (same line number + identical text, else block id, else a unique identical line). If the line changed, the write is refused with a message — no blind overwrites.

## Goal — `05-Goals/<Name>.md`

```yaml
type: goal
level: year          # vision | year | quarter | month | week
status: active       # active | achieved | paused | dropped
area: Career
parent: "[[Senior Systems Engineer werden]]"
due: 2026-12-20
target: 12           # optional measurable goal
current: 9
unit: Bücher
```
Progress source, in order: `achieved` → 100 %; `current/target` metric; otherwise the average of linked projects (`goals:` on projects), sub-goals (`parent:`) and the goal's own tasks. If none exist, the UI says *No measurable data yet*. Metric updates from the UI append a line to `## Verlauf`.

## Worklog — `02-Worklogs/<year>/<date> <title>.md`

```yaml
type: worklog
date: 2026-11-10
project: "[[Netzwerk-Umbau VLAN]]"
duration: 2h 30m        # 150, "1.5h", "01:30", "90m" all work (numbers ≤ 24 are hours)
technologies: [VLAN, Cisco IOS]
context: work           # work (Betrieb) | school (Berufsschule) | private
```
Body sections (German or English headings are recognised): `## Tätigkeit`, `## Gelernt`, `## Probleme`, `## Lösungen`, `## Offene Fragen`, `## Nächste Schritte`. List items become structured data (skills, weekly summary, review input). The **Ausbildungsnachweis** export only includes `work` and `school` entries.

## Knowledge note — `03-Knowledge/<Topic>/<Title>.md`

```yaml
type: note
topic: Netzwerk         # defaults to the first folder below 03-Knowledge
tags: [network, vlan]
favorite: true
collection: CCNA Lernpfad
```
Any Markdown file outside the system folder without a `type` counts as a knowledge note, so an existing vault shows up immediately.

## Learning item — `03-Knowledge/Learning/<Title>.md`

```yaml
type: learning
status: active          # planned | active | done | paused
progress: 28
total: 45
unit: Module
```
Sessions are body lines: `- 2026-11-10 · 45min · OSPF`. They feed the learning heatmap and streak.

## Daily note — `01-Daily/<date>.md`

```yaml
type: daily
date: 2026-11-10
focus: The one thing that makes today a win
focusProject: "[[Netzwerk-Umbau VLAN]]"
motto: Erst verstehen, dann konfigurieren.
habits: [Lernen, Sport]   # habits completed that day
```

## Journal entry — `06-Journal/<year>/<date>.md`

```yaml
type: journal
date: 2026-11-10
mood: 4                   # 1..5, optional
```
Sections: `## Gedanken`, `## Highlights`, `## Erkenntnisse`, `## Nächster Fokus`.

## Review — `06-Journal/Reviews/<key> <Period> Review.md`

```yaml
type: review
period: weekly            # daily | weekly | monthly | quarterly
periodKey: 2026-W46       # 2026-11-10 | 2026-W46 | 2026-11 | 2026-Q4
date: 2026-11-10
```
Contains an auto-generated summary (from real data) and your reflection answers. Saving again in the same period appends instead of overwriting.

## Resource — `07-Resources/<Title>.md`

```yaml
type: resource
url: https://…
topic: Netzwerk
```
Linked from projects with `[[…]]`.

## Technical state (JSON)

`.obsidian/plugins/second-brain-core/data.json` holds only settings and UI state (last route, sidebar, view modes, dashboard order). Backups live in `.sbos/backups/<date>/<path>` (automatic, per edited file per day) and `.sbos/full-backups/<timestamp>/` (manual command). `.sbos/` is excluded from Obsidian's index.
