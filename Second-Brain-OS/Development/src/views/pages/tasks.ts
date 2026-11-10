import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { button, card, emptyState, pageHeader, sectionTitle, segmented, textInput, select, chip } from '../../ui/components/basic';
import { taskList, taskRow } from '../../ui/components/task-row';
import type { AppContext, PageDef } from '../context';
import { bucketTasks, sortTasks, isOpen, PRIORITY_RANK } from '../../core/queries';
import { addDays, fmt } from '../../core/dates';
import { parseQuickTask } from '../../core/quick-parse';
import { virtualList } from './common';
import type { Task } from '../../core/types';

export function quickAdd(ctx: AppContext, opts: { project?: string; due?: string; placeholder?: string; target?: string } = {}) {
  const projects = ctx.snap().projects.filter((p) => !p.archived).map((p) => p.basename);
  const hint = h('span', { class: 'sb-quickadd__hint' });
  const input = textInput({
    placeholder: opts.placeholder ?? 'Add a task…  try “Patchday vorbereiten fri !high”',
    class: 'sb-quickadd__input',
    props: { dataset: { focusKey: 'quickadd' } },
    onInput: (v) => {
      const q = parseQuickTask(v, ctx.today(), projects);
      hint.textContent = [q.due && `📅 ${fmt(q.due, ctx.settings.locale, { weekday: 'short', day: 'numeric', month: 'short' })}`, q.priority && `⚑ ${q.priority}`, q.project && `▦ ${q.project}`, q.recurrence && `↻ ${q.recurrence}`].filter(Boolean).join('  ');
    },
    onEnter: async (v) => {
      const q = parseQuickTask(v, ctx.today(), projects);
      if (!q.text) return;
      input.value = '';
      hint.textContent = '';
      await ctx.run('Task added', () => ctx.actions.addTask({ text: q.text, due: q.due ?? opts.due, priority: q.priority, recurrence: q.recurrence, project: q.project ?? opts.project, target: opts.target }), { undoable: true });
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-focus-key="quickadd"]')?.focus());
    },
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') input.blur(); e.stopPropagation(); });
  return h('div', { class: 'sb-quickadd' }, icon('plus', 16, 'sb-quickadd__icon'), input, hint);
}

type View = 'inbox' | 'today' | 'upcoming' | 'all' | 'priorities' | 'completed';

export const TasksPage: PageDef = {
  id: 'tasks',
  nav: 'tasks',
  title: () => 'Tasks',
  render(ctx, root) {
    const st = ctx.state('tasks', { view: (ctx.settings.ui.taskView as View) || 'today', project: '', q: '' });
    const snap = ctx.snap();
    const t = ctx.today();
    const tasks = snap.tasks.filter((x) => !snap.byPath.get(x.path)?.archived || x.status === 'done');
    const b = bucketTasks(tasks, t, ctx.settings.inboxFile);
    const counts: Record<View, number> = {
      inbox: b.inbox.length, today: b.today.length + b.overdue.length, upcoming: b.upcoming.length,
      all: tasks.filter(isOpen).length, priorities: tasks.filter((x) => isOpen(x) && (x.priority === 'urgent' || x.priority === 'high')).length, completed: b.completed.length,
    };
    root.append(pageHeader({ eyebrow: 'Tasks & Planning', title: 'Tasks', subtitle: `${counts.all} open · ${counts.today} for today · ${b.completed.filter((x) => x.done === t).length} completed today` }));
    const projOptions = [{ value: '', label: 'All projects' }, ...snap.projects.filter((p) => !p.archived).map((p) => ({ value: p.basename.toLowerCase(), label: p.title }))];
    root.append(h('div', { class: 'sb-toolbar' },
      segmented<View>([
        { id: 'inbox', label: 'Inbox', icon: 'inbox', count: counts.inbox },
        { id: 'today', label: 'Today', icon: 'today', count: counts.today },
        { id: 'upcoming', label: 'Upcoming', icon: 'calendar', count: counts.upcoming },
        { id: 'priorities', label: 'Priorities', icon: 'flag', count: counts.priorities },
        { id: 'all', label: 'All open', icon: 'list' },
        { id: 'completed', label: 'Completed', icon: 'check' },
      ], st.view, (v) => { st.view = v; ctx.settings.ui.taskView = v; ctx.saveSettings(); ctx.refresh(); }, { ariaLabel: 'Task views' }),
      h('span', { class: 'sb-grow' }),
      select(projOptions, st.project, (v) => { st.project = v; ctx.refresh(); }),
      textInput({ placeholder: 'Filter…', value: st.q, class: 'sb-input--sm', props: { dataset: { focusKey: 'taskfilter' } }, onInput: (v) => { st.q = v; ctx.refresh(); } })));

    root.append(quickAdd(ctx, { due: st.view === 'today' ? t : undefined, project: st.project ? snap.byBasename.get(st.project)?.basename : undefined }));

    const filter = (arr: Task[]) => arr.filter((x) => (!st.project || x.project === st.project) && (!st.q || x.text.toLowerCase().includes(st.q.toLowerCase())));
    const list = (arr: Task[], empty: HTMLElement) => taskList(ctx, filter(arr), { empty });
    const body = h('div', { class: 'sb-tasks-body' });
    switch (st.view) {
      case 'inbox':
        body.append(list(sortTasks(b.inbox, t), emptyState({ icon: 'inbox', title: 'Inbox zero', text: 'Captured tasks without date or project land here.' })));
        break;
      case 'today': {
        const overdue = filter(b.overdue);
        if (overdue.length) body.append(sectionTitle('Overdue', null, overdue.length), taskList(ctx, sortTasks(overdue, t)));
        body.append(sectionTitle('Today', null, filter(b.today).length), list(sortTasks(b.today, t), emptyState({ icon: 'today', title: 'Nothing planned for today', text: 'Pick tasks from Upcoming or your Inbox.', compact: true })));
        const doneToday = filter(b.completed.filter((x) => x.done === t));
        if (doneToday.length) body.append(sectionTitle('Done today', null, doneToday.length), taskList(ctx, doneToday));
        break;
      }
      case 'upcoming': {
        const groups = new Map<string, Task[]>();
        for (const x of filter(b.upcoming)) {
          const d = (x.scheduled && (!x.due || x.scheduled < x.due) ? x.scheduled : x.due)!;
          const key = d <= addDays(t, 7) ? d : d.slice(0, 7);
          (groups.get(key) ?? groups.set(key, []).get(key)!).push(x);
        }
        if (!groups.size) body.append(emptyState({ icon: 'calendar', title: 'Nothing upcoming', text: 'Tasks with a future date appear here.' }));
        for (const [k, arr] of [...groups.entries()].sort((a, b2) => (a[0] < b2[0] ? -1 : 1))) {
          const label = k.length === 10 ? fmt(k, ctx.settings.locale, { weekday: 'long', day: 'numeric', month: 'long' }) : fmt(k + '-01', ctx.settings.locale, { month: 'long', year: 'numeric' });
          body.append(sectionTitle(label, null, arr.length), taskList(ctx, sortTasks(arr, t)));
        }
        break;
      }
      case 'priorities': {
        for (const p of ['urgent', 'high'] as const) {
          const arr = filter(tasks.filter((x) => isOpen(x) && x.priority === p));
          if (arr.length) body.append(sectionTitle(p === 'urgent' ? 'Urgent' : 'High priority', null, arr.length), taskList(ctx, sortTasks(arr, t)));
        }
        if (!body.childElementCount) body.append(emptyState({ icon: 'flag', title: 'No urgent or high-priority tasks', text: 'Use !high in quick add to flag one.' }));
        break;
      }
      case 'all': {
        const open = filter(tasks.filter(isOpen));
        const byProject = new Map<string, Task[]>();
        for (const x of open) (byProject.get(x.project ?? '') ?? byProject.set(x.project ?? '', []).get(x.project ?? '')!).push(x);
        const keys = [...byProject.keys()].sort((a, b2) => (a === '' ? 1 : b2 === '' ? -1 : ctx.projectTitle(a).localeCompare(ctx.projectTitle(b2))));
        for (const k of keys) body.append(sectionTitle(k ? ctx.projectTitle(k) : 'No project', null, byProject.get(k)!.length), taskList(ctx, sortTasks(byProject.get(k)!, t), { showProject: false }));
        if (!open.length) body.append(emptyState({ icon: 'check', title: 'No open tasks' }));
        break;
      }
      case 'completed': {
        const done = filter(b.completed);
        body.append(done.length ? virtualList(done, 46, (x) => taskRow(ctx, x), { key: 'done-tasks', height: 620 }) : emptyState({ icon: 'check', title: 'Nothing completed yet' }));
        break;
      }
    }
    root.append(body);
  },
  context(ctx, el) {
    const snap = ctx.snap();
    const t = ctx.today();
    const open = snap.tasks.filter(isOpen);
    const byPrio = (['urgent', 'high', 'medium', 'low', 'none'] as const).map((p) => [p, open.filter((x) => x.priority === p).length] as const);
    el.append(h('h4', { class: 'sb-context__title' }, 'Open by priority'),
      h('div', { class: 'sb-mini-bars' }, ...byPrio.map(([p, n]) => h('div', { class: 'sb-mini-bars__row' }, h('span', null, p), h('span', { class: 'sb-mini-bars__bar', style: { '--w': `${open.length ? (n / open.length) * 100 : 0}%` } }), h('span', { class: 'sb-num' }, String(n))))));
    const recurring = open.filter((x) => x.recurrence);
    if (recurring.length) el.append(h('h4', { class: 'sb-context__title' }, 'Recurring'), taskList(ctx, sortTasks(recurring, t), { compact: true }));
    el.append(h('h4', { class: 'sb-context__title' }, 'Syntax'), h('p', { class: 'sb-muted sb-small' }, 'Tasks are Markdown checkboxes in any note. 📅 due · ⏳ scheduled · ⏫ priority · 🔁 every week · #milestone. Edits are verified line-by-line before writing.'));
  },
};

export const TodayPage: PageDef = {
  id: 'today',
  nav: 'today',
  title: () => 'Today',
  render(ctx, root) {
    const snap = ctx.snap();
    const t = ctx.today();
    const daily = snap.daily.find((d) => d.date === t);
    const b = bucketTasks(snap.tasks, t, ctx.settings.inboxFile);
    root.append(pageHeader({
      eyebrow: fmt(t, ctx.settings.locale, { weekday: 'long' }),
      title: fmt(t, ctx.settings.locale, { day: 'numeric', month: 'long', year: 'numeric' }),
      subtitle: daily?.focus ? `Focus: ${daily.focus}` : 'Plan your day: choose a focus, pick tasks, log your work.',
      actions: [
        button({ label: daily ? 'Open daily note' : 'Create daily note', icon: 'file', variant: 'ghost', onClick: async () => { const p = await ctx.actions.ensureDaily(t); ctx.edit(p); } }),
        button({ label: 'Daily review', icon: 'reviews', onClick: () => ctx.navigate('review/daily') }),
      ],
    }));
    const left = h('div', { class: 'sb-col' });
    const right = h('div', { class: 'sb-col sb-col--side' });
    left.append(quickAdd(ctx, { due: t, placeholder: 'Add a task for today…' }));
    if (b.overdue.length) left.append(sectionTitle('Overdue', button({ label: 'Move all to today', size: 'sm', variant: 'ghost', onClick: () => ctx.run('Rescheduled', async () => { for (const x of b.overdue) await ctx.actions.setTaskDue(x, t); }) }), b.overdue.length), taskList(ctx, sortTasks(b.overdue, t)));
    left.append(sectionTitle('Today', null, b.today.length), taskList(ctx, sortTasks(b.today, t), { empty: emptyState({ compact: true, icon: 'today', title: 'No tasks planned', text: 'Pull from below or add one above.' }) }));
    const suggestions = sortTasks([...b.inbox, ...b.someday].filter((x) => x.priority === 'urgent' || x.priority === 'high'), t).slice(0, 5);
    const soon = b.upcoming.filter((x) => (x.due ?? x.scheduled)! <= addDays(t, 3)).slice(0, 5);
    if (suggestions.length || soon.length) {
      left.append(sectionTitle('Suggested'));
      const sug = h('div', { class: 'sb-tasklist' });
      for (const x of [...soon, ...suggestions]) {
        const row = taskRow(ctx, x, { compact: true, noSwipe: true });
        row.append(button({ label: 'Today', size: 'sm', variant: 'subtle', class: 'sb-task__pull', onClick: () => ctx.run('Planned for today', () => ctx.actions.setTaskDue(x, t), { undoable: true }) }));
        sug.append(row);
      }
      left.append(sug);
    }
    const doneToday = b.completed.filter((x) => x.done === t);
    if (doneToday.length) left.append(sectionTitle('Done today', null, doneToday.length), taskList(ctx, doneToday));

    // side: worklog + journal + habits
    const logs = snap.worklogs.filter((w) => w.date === t);
    right.append(card({ title: 'Worklog', icon: 'worklog', actions: [button({ label: 'New', icon: 'plus', size: 'sm', variant: 'ghost', onClick: () => ctx.capture('worklog') })] },
      logs.length ? h('div', { class: 'sb-list' }, ...logs.map((w) => h('a', { class: 'sb-row', attrs: { href: '#' }, on: { click: (e: Event) => { e.preventDefault(); ctx.open(w.path); } } }, h('span', { class: 'sb-row__main' }, h('span', { class: 'sb-row__title' }, w.title), h('span', { class: 'sb-row__meta' }, [w.project && ctx.projectTitle(w.project), w.minutes !== undefined && `${Math.round(w.minutes / 6) / 10} h`].filter(Boolean).join(' · ')))))) : emptyState({ compact: true, icon: 'worklog', title: 'Nothing logged yet', text: 'Document what you did, learned and solved.' })));
    const journal = snap.journal.find((j) => j.date === t);
    right.append(card({ title: 'Journal', icon: 'journal', actions: [button({ label: journal ? 'Add' : 'Write', icon: 'edit', size: 'sm', variant: 'ghost', onClick: () => ctx.capture('journal') })] },
      journal ? h('p', { class: ['sb-excerpt', ctx.settings.privacyMode && 'is-private'] }, journal.excerpt || 'Entry started.') : h('p', { class: 'sb-muted' }, 'A few lines of reflection go a long way.')));
    if (ctx.settings.habits.length) {
      const done = new Set(daily?.habits ?? []);
      right.append(card({ title: 'Habits', icon: 'repeat' }, h('div', { class: 'sb-chips' }, ...ctx.settings.habits.map((name) => chip(name, { tone: done.has(name) ? 'accent' : 'neutral', icon: done.has(name) ? 'check' : undefined, onClick: () => ctx.run(done.has(name) ? `${name} unchecked` : `${name} ✓`, async () => {
        const p = await ctx.actions.ensureDaily(t);
        const cur = new Set(ctx.snap().daily.find((d) => d.date === t)?.habits ?? []);
        cur.has(name) ? cur.delete(name) : cur.add(name);
        await ctx.actions.setFrontmatter(p, { habits: [...cur] }, 'Toggle habit');
      }, { silent: true }) })))));
    }
    const prio = snap.projects.filter((p) => p.status === 'active').sort((a, b2) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b2.priority]).slice(0, 3);
    if (prio.length) right.append(card({ title: 'Priorities', icon: 'flag' }, h('div', { class: 'sb-list' }, ...prio.map((p) => h('a', { class: 'sb-row', attrs: { href: '#' }, on: { click: (e: Event) => { e.preventDefault(); ctx.navigate(`project/${p.path}`); } } }, h('span', { class: 'sb-row__main' }, h('span', { class: 'sb-row__title' }, p.title), h('span', { class: 'sb-row__meta' }, `${p.priority} priority`)))))));
    root.append(h('div', { class: 'sb-split' }, left, right));
  },
};
