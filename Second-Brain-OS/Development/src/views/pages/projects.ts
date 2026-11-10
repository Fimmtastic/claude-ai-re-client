import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { button, card, chip, emptyState, pageHeader, priorityMark, progressBar, progressRing, sectionTitle, segmented, stat, statusDot, cap } from '../../ui/components/basic';
import { menu } from '../../ui/components/overlay';
import { taskList, taskRow } from '../../ui/components/task-row';
import type { AppContext, PageDef } from '../context';
import type { Project, ProjectStatus, Task, TaskStatus } from '../../core/types';
import { activity, milestones, nextAction, projectProgress, projectTasks, sortTasks, isOpen, PRIORITY_RANK } from '../../core/queries';
import { addMonths, diffDays, fmt, parseISO, toISO } from '../../core/dates';
import { formatMinutes } from '../../core/schema';
import { entityRow, projectRow, propList, timeline } from './common';
import { quickAdd } from './tasks';

const STATUSES: ProjectStatus[] = ['planned', 'active', 'paused', 'done'];

export const ProjectsPage: PageDef = {
  id: 'projects',
  nav: 'projects',
  title: () => 'Projects',
  actions: (ctx) => [button({ label: 'New project', icon: 'plus', size: 'sm', variant: 'ghost', onClick: () => ctx.capture('project') })],
  render(ctx, root) {
    const snap = ctx.snap();
    const projects = snap.projects.filter((p) => !p.archived);
    const view = ctx.settings.ui.projectView;
    root.append(pageHeader({ eyebrow: 'Projects', title: 'Projects', subtitle: `${projects.filter((p) => p.status === 'active').length} active · ${projects.filter((p) => p.status === 'planned').length} planned · ${projects.filter((p) => p.status === 'done').length} done` }));
    root.append(h('div', { class: 'sb-toolbar' }, segmented([
      { id: 'list', label: 'List', icon: 'list' }, { id: 'kanban', label: 'Board', icon: 'kanban' }, { id: 'timeline', label: 'Timeline', icon: 'timeline' },
    ], view, (v) => { ctx.settings.ui.projectView = v as typeof view; ctx.saveSettings(); ctx.refresh(); }, { ariaLabel: 'Project view' })));
    if (!projects.length) {
      root.append(emptyState({ icon: 'projects', title: 'No projects yet', text: 'A project is a Markdown note in 04-Projects. Tasks inside it belong to it automatically.', action: button({ label: 'Create project', variant: 'primary', onClick: () => ctx.capture('project') }) }));
      return;
    }
    const sorted = [...projects].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title));
    if (view === 'list') {
      for (const s of ['active', 'planned', 'paused', 'done'] as ProjectStatus[]) {
        const arr = sorted.filter((p) => p.status === s);
        if (!arr.length) continue;
        root.append(sectionTitle(cap(s), null, arr.length), h('div', { class: 'sb-project-grid' }, ...arr.map((p) => projectRow(ctx, p))));
      }
    } else if (view === 'kanban') {
      root.append(board<Project>(ctx, {
        columns: STATUSES.map((s) => ({ id: s, label: cap(s) })),
        items: sorted,
        columnOf: (p) => p.status,
        key: (p) => p.path,
        render: (p) => projectRow(ctx, p, { compact: true }),
        move: (p, to) => ctx.run(`Moved to ${to}`, () => ctx.actions.setFrontmatter(p.path, { status: to }, 'Change project status'), { undoable: true }),
      }));
    } else {
      root.append(projectTimeline(ctx, sorted));
    }
  },
  context(ctx, el) {
    const snap = ctx.snap();
    const t = ctx.today();
    const soon = snap.projects.filter((p) => p.deadline && p.status !== 'done' && diffDays(p.deadline, t) <= 21).sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1));
    el.append(h('h4', { class: 'sb-context__title' }, 'Upcoming deadlines'));
    if (!soon.length) el.append(h('p', { class: 'sb-muted' }, 'No deadlines in the next 3 weeks.'));
    for (const p of soon) el.append(entityRow(ctx, p, { meta: `${fmt(p.deadline, ctx.settings.locale, { day: 'numeric', month: 'short' })} · ${diffDays(p.deadline!, t)} days` }));
  },
};

export function board<T>(ctx: AppContext, o: { columns: { id: string; label: string }[]; items: T[]; columnOf: (x: T) => string; key: (x: T) => string; render: (x: T) => HTMLElement; move: (x: T, to: string) => Promise<unknown> }) {
  const el = h('div', { class: 'sb-board', style: { '--cols': String(o.columns.length) } });
  const byKey = new Map(o.items.map((x) => [o.key(x), x]));
  for (const col of o.columns) {
    const items = o.items.filter((x) => o.columnOf(x) === col.id);
    const list = h('div', { class: 'sb-board__list', dataset: { col: col.id } });
    for (const it of items) {
      const card = o.render(it);
      card.setAttribute('draggable', 'true');
      card.classList.add('sb-board__card');
      card.addEventListener('dragstart', (e) => { e.dataTransfer?.setData('text/sb-board', o.key(it)); card.classList.add('is-dragging'); });
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
      card.addEventListener('keydown', (e) => {
        if (!e.altKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
        e.preventDefault();
        const i = o.columns.findIndex((c) => c.id === col.id) + (e.key === 'ArrowRight' ? 1 : -1);
        const target = o.columns[i];
        if (target) void o.move(it, target.id);
      });
      list.append(card);
    }
    if (!items.length) list.append(h('div', { class: 'sb-board__empty' }, 'Drop here'));
    const colEl = h('section', { class: 'sb-board__col' }, h('header', { class: 'sb-board__head' }, statusDot(col.id, false), h('span', null, col.label), h('span', { class: 'sb-count sb-num' }, String(items.length))), list);
    colEl.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('text/sb-board')) { e.preventDefault(); colEl.classList.add('is-over'); } });
    colEl.addEventListener('dragleave', (e) => { if (!colEl.contains(e.relatedTarget as Node)) colEl.classList.remove('is-over'); });
    colEl.addEventListener('drop', (e) => {
      e.preventDefault();
      colEl.classList.remove('is-over');
      const k = e.dataTransfer?.getData('text/sb-board');
      const it = k ? byKey.get(k) : undefined;
      if (it && o.columnOf(it) !== col.id) void o.move(it, col.id);
    });
    el.append(colEl);
  }
  el.append(h('p', { class: 'sb-board__hint sb-muted sb-small' }, 'Drag cards between columns · keyboard: focus a card and press Alt ←/→'));
  return el;
}

function projectTimeline(ctx: AppContext, projects: Project[]) {
  const t = ctx.today();
  const dated = projects.filter((p) => p.start || p.deadline);
  if (!dated.length) return emptyState({ icon: 'timeline', title: 'No dated projects', text: 'Add start and deadline properties to see projects on the timeline.' });
  const min = [t, ...dated.map((p) => p.start ?? p.deadline!)].sort()[0]!.slice(0, 7) + '-01';
  const maxRaw = [t, ...dated.map((p) => p.deadline ?? addMonths(p.start!, 1))].sort().pop()!;
  const months: string[] = [];
  for (let m = min; m <= maxRaw && months.length < 24; m = addMonths(m, 1)) months.push(m);
  const end = addMonths(months[months.length - 1]!, 1);
  const span = diffDays(end, min);
  const pos = (d: string) => `${(Math.max(0, Math.min(span, diffDays(d, min))) / span) * 100}%`;
  const el = h('div', { class: 'sb-gantt' });
  el.append(h('div', { class: 'sb-gantt__months' }, ...months.map((m) => h('span', null, fmt(m, ctx.settings.locale, { month: 'short', year: months.length > 12 || m.endsWith('-01-01') ? '2-digit' : undefined })))));
  const rows = h('div', { class: 'sb-gantt__rows' });
  rows.append(h('div', { class: 'sb-gantt__today', style: { left: pos(t) }, attrs: { 'data-tip': 'Today' } }));
  for (const p of dated) {
    const s = p.start ?? p.deadline!;
    const e = p.deadline ?? toISO(new Date(parseISO(s).getTime() + 14 * 86400000));
    const prog = projectProgress(ctx.snap(), p);
    const bar = h('a', { class: ['sb-gantt__bar', `is-${p.status}`], attrs: { href: '#', 'data-tip': `${p.title} · ${s} → ${p.deadline ?? 'open'}` }, style: { left: pos(s), width: `calc(${pos(e)} - ${pos(s)})` } },
      h('span', { class: 'sb-gantt__fill', style: { transform: `scaleX(${prog.ratio ?? 0})` } }), h('span', { class: 'sb-gantt__label' }, p.title));
    bar.addEventListener('click', (ev) => { ev.preventDefault(); ctx.navigate(`project/${p.path}`); });
    rows.append(h('div', { class: 'sb-gantt__row' }, bar));
  }
  el.append(rows);
  return el;
}

// ─────────────────────────── Project detail ───────────────────────────

const TASK_COLS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'To do' }, { id: 'doing', label: 'In progress' }, { id: 'done', label: 'Done' },
];

export const ProjectPage: PageDef = {
  id: 'project',
  nav: 'projects',
  crumbs: () => [{ label: 'Projects', route: 'projects' }],
  title: (ctx, path) => ctx.snap().byPath.get(path ?? '')?.title ?? 'Project',
  actions: (ctx, path) => [
    button({ icon: 'edit', label: 'Edit note', size: 'sm', variant: 'ghost', onClick: () => path && ctx.edit(path) }),
  ],
  render(ctx, root, path) {
    const snap = ctx.snap();
    const p = snap.byPath.get(path ?? '');
    if (!p || p.kind !== 'project') {
      root.append(emptyState({ icon: 'projects', title: 'Project not found', text: 'It may have been moved or deleted.', action: button({ label: 'All projects', onClick: () => ctx.navigate('projects') }) }));
      return;
    }
    const st = ctx.state(`project:${p.path}`, { taskView: 'board' as 'board' | 'list', showDone: false });
    const t = ctx.today();
    const tasks = projectTasks(snap, p);
    const prog = projectProgress(snap, p);
    const ms = milestones(snap, p);
    const key = p.basename.toLowerCase();
    const worklogs = snap.worklogs.filter((w) => w.project === key);
    const minutes = worklogs.reduce((a, w) => a + (w.minutes ?? 0), 0);
    const goals = p.goals.map((g) => snap.byBasename.get(g)).filter((g): g is NonNullable<typeof g> => !!g && g.kind === 'goal');

    const statusBtn = button({ label: cap(p.status), size: 'sm', variant: 'subtle', class: 'sb-status-btn', onClick: (e) => menu(STATUSES.concat('archived' as ProjectStatus).map((s) => ({ label: cap(s), checked: p.status === s, run: () => ctx.run(`Status: ${s}`, () => ctx.actions.setFrontmatter(p.path, { status: s }, 'Change project status'), { undoable: true }) })), e.currentTarget as HTMLElement) });
    statusBtn.prepend(statusDot(p.status, false));
    root.append(h('header', { class: 'sb-detail-head' },
      h('div', { class: 'sb-detail-head__main' },
        h('div', { class: 'sb-eyebrow' }, icon('projects', 13), p.area ?? 'Project', priorityMark(p.priority)),
        h('h1', { class: 'sb-page__title' }, p.title),
        p.description ? h('p', { class: 'sb-page__subtitle' }, p.description) : null,
        h('div', { class: 'sb-detail-head__chips' }, statusBtn,
          p.start ? chip(`Start ${fmt(p.start, ctx.settings.locale, { day: 'numeric', month: 'short' })}`, { icon: 'calendar' }) : null,
          p.deadline ? chip(`Due ${fmt(p.deadline, ctx.settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })}`, { icon: 'flag', tone: diffDays(p.deadline, t) < 0 && p.status !== 'done' ? 'danger' : 'neutral' }) : null,
          ...goals.map((g) => chip(g.title, { icon: 'goals', onClick: () => ctx.navigate(`goal/${g.path}`) })))),
      progressRing(prog.ratio, 76, 5)));

    root.append(h('div', { class: 'sb-stats sb-stats--wide' },
      stat({ label: 'Open tasks', value: tasks.filter(isOpen).length }),
      stat({ label: 'Completed', value: prog.done }),
      stat({ label: 'Milestones', value: ms.length, hint: ms.length ? `${ms.filter((m) => m.status === 'done').length} reached` : undefined }),
      h('div', { class: 'sb-stat' }, h('span', { class: 'sb-stat__label' }, 'Time logged'), h('span', { class: 'sb-stat__value sb-num' }, minutes ? formatMinutes(minutes) : '—'), h('span', { class: 'sb-stat__hint' }, `${worklogs.length} worklog${worklogs.length === 1 ? '' : 's'}`))));

    const next = nextAction(snap, p, t);
    const main = h('div', { class: 'sb-col' });
    const side = h('div', { class: 'sb-col sb-col--side' });
    if (next) main.append(card({ class: 'sb-next', title: 'Next action', icon: 'arrow' }, taskRow(ctx, next, { showProject: false })));

    // milestones
    main.append(sectionTitle('Milestones', button({ label: 'Add', icon: 'plus', size: 'sm', variant: 'ghost', onClick: () => ctx.capture('task', { project: p.basename, text: '#milestone ' }) }), ms.length));
    if (ms.length) {
      const line = h('ol', { class: 'sb-milestones' }, ...sortTasks(ms, t).sort((a, b) => (a.due ?? '9') < (b.due ?? '9') ? -1 : 1).map((m) => h('li', { class: ['sb-milestone', `is-${m.status}`] },
        h('span', { class: 'sb-milestone__dot' }, m.status === 'done' ? icon('check', 11) : null),
        h('span', { class: 'sb-milestone__title' }, m.text),
        m.due ? h('span', { class: 'sb-milestone__date sb-num' }, fmt(m.due, ctx.settings.locale, { day: 'numeric', month: 'short' })) : null)));
      main.append(line);
    } else main.append(h('p', { class: 'sb-muted sb-small' }, 'Tag a task with #milestone to mark key checkpoints.'));

    // tasks
    main.append(sectionTitle('Tasks', segmented([{ id: 'board', label: 'Board', icon: 'kanban' }, { id: 'list', label: 'List', icon: 'list' }], st.taskView, (v) => { st.taskView = v as 'board' | 'list'; ctx.refresh(); }, { size: 'sm' }), tasks.filter((x) => !x.milestone).length));
    main.append(quickAdd(ctx, { project: p.basename, placeholder: `Add task to ${p.title}…` }));
    const regular = tasks.filter((x) => !x.milestone && x.status !== 'cancelled');
    if (st.taskView === 'board') {
      main.append(board<Task>(ctx, {
        columns: TASK_COLS,
        items: sortTasks(regular, t),
        columnOf: (x) => x.status,
        key: (x) => x.id,
        render: (x) => taskRow(ctx, x, { showProject: false, compact: true }),
        move: (x, to) => ctx.run(to === 'done' ? 'Task completed' : 'Task moved', () => ctx.actions.setTaskStatus(x, to as TaskStatus), { undoable: true }),
      }));
    } else {
      main.append(taskList(ctx, sortTasks(regular.filter((x) => st.showDone || isOpen(x)), t), { showProject: false, empty: emptyState({ compact: true, icon: 'tasks', title: 'No open tasks' }) }),
        button({ label: st.showDone ? 'Hide completed' : `Show completed (${regular.filter((x) => x.status === 'done').length})`, size: 'sm', variant: 'ghost', onClick: () => { st.showDone = !st.showDone; ctx.refresh(); } }));
    }

    // linked notes & resources
    const backlinks = new Set(ctx.port.backlinks(p.path));
    const linked = snap.entities.filter((e) => e.path !== p.path && (backlinks.has(e.path) || p.links.includes(e.basename.toLowerCase())) && e.kind !== 'worklog' && e.kind !== 'daily');
    const notes = linked.filter((e) => e.kind === 'note' || e.kind === 'learning');
    const resources = linked.filter((e) => e.kind === 'resource');
    side.append(card({ title: 'Notes', icon: 'knowledge', actions: [button({ icon: 'plus', title: 'New linked note', size: 'sm', variant: 'ghost', onClick: () => ctx.run('Note created', async () => { const np = await ctx.actions.create({ kind: 'note', title: `${p.title} – Notiz`, body: `Projekt: [[${p.basename}]]\n` }); ctx.edit(np); }) })] },
      notes.length ? h('div', { class: 'sb-list' }, ...notes.map((n) => entityRow(ctx, n))) : h('p', { class: 'sb-muted sb-small' }, 'Link notes with [[' + p.basename + ']] to see them here.')));
    side.append(card({ title: 'Resources', icon: 'link' }, resources.length ? h('div', { class: 'sb-list' }, ...resources.map((n) => entityRow(ctx, n, { meta: n.kind === 'resource' && 'url' in n && n.url ? new URL(n.url, 'https://x').hostname : undefined }))) : h('p', { class: 'sb-muted sb-small' }, 'Resources in 07-Resources that link here appear automatically.')));
    side.append(card({ title: 'Worklogs', icon: 'worklog', actions: [button({ icon: 'plus', title: 'New worklog for this project', size: 'sm', variant: 'ghost', onClick: () => ctx.capture('worklog', { project: p.basename }) })] },
      worklogs.length ? h('div', { class: 'sb-list' }, ...worklogs.slice(0, 6).map((w) => entityRow(ctx, w, { meta: `${fmt(w.date, ctx.settings.locale, { day: 'numeric', month: 'short' })}${w.minutes !== undefined ? ' · ' + formatMinutes(w.minutes) : ''}` }))) : h('p', { class: 'sb-muted sb-small' }, 'No worklogs yet.')));
    const projectFiles = new Set([p.path, ...worklogs.map((w) => w.path), ...notes.map((n) => n.path)]);
    const ev = activity(snap, 200, 60, ctx.now().getTime()).filter((e) => projectFiles.has(e.path)).slice(0, 10);
    side.append(card({ title: 'Activity', icon: 'clock' }, ev.length ? timeline(ctx, ev) : h('p', { class: 'sb-muted sb-small' }, 'No activity in the last 60 days.')));
    root.append(h('div', { class: 'sb-split' }, main, side));
  },
  context(ctx, el, path) {
    const p = ctx.snap().byPath.get(path ?? '');
    if (!p || p.kind !== 'project') return;
    el.append(h('h4', { class: 'sb-context__title' }, 'Properties'), propList([
      ['Status', p.status], ['Priority', p.priority], ['Area', p.area], ['Start', p.start], ['Deadline', p.deadline], ['ID', h('code', null, p.id)], ['File', p.path],
    ]));
    if (p.issues.length) el.append(h('h4', { class: 'sb-context__title' }, 'Warnings'), ...p.issues.map((i) => h('p', { class: 'sb-muted sb-small' }, i)));
    el.append(button({ label: 'Open in editor', icon: 'external', variant: 'secondary', onClick: () => ctx.edit(p.path) }));
    el.append(h('div', { class: 'sb-ctx-progress' }, progressBar(projectProgress(ctx.snap(), p).ratio, { label: true })));
  },
};
