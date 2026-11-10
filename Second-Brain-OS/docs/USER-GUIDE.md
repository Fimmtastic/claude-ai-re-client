# User guide

## A day with Second Brain OS
1. **Morning: Home.** Your greeting, a summary of the day, and **Today's focus**. Click the pencil to set the one thing that makes today a win. It's stored in today's daily note.
2. **Plan: Today** (`G D`). Overdue tasks, today's tasks and suggestions (due soon or high priority). *Today* on a suggestion plans it for today.
3. **Work.** Capture with `C` from anywhere. Tick tasks with a click, `Space` or `X`. Right-click a task (or use ⋯) to reschedule, change priority, rename or open it in its note.
4. **Document: Worklog** (`W`). What you did, learned, which problems you hit and how you solved them, open questions, next steps, project, duration and technologies.
5. **Evening: Daily review** (`G R`). Look back at what you completed, process the inbox, answer three reflection questions. Saving writes a review note and sets tomorrow's focus.
6. **Weekly review** on Fridays: what moved per project, time per project, everything you learned, stalled projects.

## Modules
| Module | What it does |
|---|---|
| **Home** | Configurable dashboard: focus, quick actions, today, projects, goals, analytics, knowledge, habits, activity. *Customize* (top right) lets you drag to reorder, hide and show widgets. |
| **Today** | Daily planning, the day's worklogs and journal, habits, priorities. |
| **Tasks** | Inbox · Today · Upcoming · Priorities · All open · Completed, with project filter and text filter. The quick-add field understands natural language. |
| **Worklogs** | Timeline grouped by calendar week, a month calendar (double-click a day to log work for it), a week view with summary, time per project, learned items, problems and solutions, and a skill map. **Export** creates the weekly *Ausbildungsnachweis* (work and school entries only). |
| **Knowledge** | Topics (folders), favorites, most-connected notes, collections, full-text search. The reader uses Obsidian's own renderer. The context panel (`]`) shows backlinks and **smart connections**: related notes with the reason for each (shared links, tags, topic). |
| **Projects** | List, board (drag between status columns) and timeline (start → deadline). The project page shows next action, milestones, a task board (todo, in progress, done; drag to move), notes, resources, worklogs and activity. |
| **Goals** | Vision → year → quarter → month → week. Progress comes from a metric (`current/target`), linked projects, sub-goals or the goal's own tasks. If there's no data, the app says so. |
| **Learning** | Courses and certifications with progress, a consistency heatmap, sessions, and everything you learned at work. |
| **Journal** | Today's entry with a writing prompt, mood trend, entries by month. *Privacy mode* blurs excerpts and keeps the journal out of search. |
| **Reviews** | Guided daily, weekly, monthly and quarterly reviews built from your real data. |
| **Archive** | Finished projects, achieved or dropped goals, archived notes. Nothing is deleted. |

## Quick add syntax
`Patchday vorbereiten fri !high @Netzwerk every week`

| Write | Meaning |
|---|---|
| `today` `heute` `tomorrow` `morgen` `übermorgen` | due date |
| `mon`…`sun`, `montag`…`sonntag` | next such weekday |
| `20.11.` `20.11.2026` `2026-11-20` | explicit date |
| `in 3 days` / `in 2 wochen` | relative |
| `!urgent` `!high` `!medium` `!low` (or `!1`–`!4`) | priority |
| `@Proj` | project (prefix match against project names) |
| `every week` / `wöchentlich` / `every 2 weeks` / `every weekday` | recurrence |

## Keyboard
| Keys | Action |
|---|---|
| `Ctrl/⌘ K` or `/` | Search everything and run commands (`>` for commands only, `#tag`) |
| `C` · `N` · `W` | Capture task · new note · new worklog |
| `G` then `H D W K P T G L J R A` | Home, Today, Worklogs, Knowledge, Projects, Tasks, Goals, Learning, Journal, Reviews, Archive |
| `[` · `]` | Toggle sidebar · context panel |
| `Alt ←` · `Alt →` | Back · forward |
| `Ctrl/⌘ Z` · `Ctrl/⌘ ⇧ Z` | Undo · redo the last app change |
| On a focused task: `Space`/`X` · `Enter` · `E` · `J`/`K` | Toggle · rename · open in note · next/previous |
| In capture: `Ctrl/⌘ ⏎` · `Alt 1…8` | Save · switch type |
| `?` | Shortcut sheet |

All commands are also in Obsidian's command palette, prefixed *Second Brain OS:*, so you can give them global hotkeys under *Settings → Hotkeys*.

## Editing in Markdown
Every page has **Edit** / **Edit note**, which opens the file in Obsidian's editor in another tab; the app tab stays open. Every editor tab shows a brain icon to go back. Everything you change in Markdown shows up in the app straight away.

## Data safety
- New files never overwrite existing ones: unique names, unique ids.
- The first change the app makes to an existing note each day is backed up to `.sbos/backups/<date>/` (kept for 14 days; configurable).
- *Create full backup* copies all notes to `.sbos/full-backups/<timestamp>/`.
- Undo works as long as the file hasn't been changed elsewhere since. If it has, the undo is refused rather than overwriting your edit.
