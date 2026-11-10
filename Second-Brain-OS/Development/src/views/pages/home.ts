import { h, clear } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { button, card, emptyState, progressBar, progressRing, segmented, stat, chip, skeleton } from '../../ui/components/basic';
import { barChart, heatmap, shareBars, sparkline } from '../../ui/components/charts';
import { taskList } from '../../ui/components/task-row';
import { countUp, enter } from '../../ui/motion';
import type { AppContext, PageDef } from '../context';
import { WIDGET_LABELS, WidgetId } from '../../core/settings';
import { activity, bucketTasks, completedPerDay, goalProgress, isOpen, learningActivity, nextMilestone, projectProgress, rediscover, sortTasks, streak, worklogMinutesPerDay, PRIORITY_RANK } from '../../core/queries';
import { addDays, fmt, startOfWeek } from '../../core/dates';
import { formatMinutes } from '../../core/schema';
import { entityRow, greeting, projectRow, timeline } from './common';
import type { DailyNote, Project } from '../../core/types';

const SPAN: Record<WidgetId, string> = {
  focus: 'span-8', quick: 'span-4', today: 'span-6', projects: 'span-6', goals: 'span-6', analytics: 'span-6', knowledge: 'span-6', habits: 'span-6', timeline: 'span-6',
};

export const HomePage: PageDef = {
  id: 'home',
  nav: 'home',
  title: () => 'Home',
  render(ctx, root) {
    const st = ctx.state('home', { editing: false, analytics: 'tasks' as string });
    const snap = ctx.snap();
    const t = ctx.today();
    const now = ctx.now();
    const daily = snap.daily.find((d) => d.date === t);
    const buckets = bucketTasks(snap.tasks, t, ctx.settings.inboxFile);
    const weekMin = snap.worklogs.filter((w) => w.date >= startOfWeek(t) && w.date <= t).reduce((a, w) => a + (w.minutes ?? 0), 0);

    // ── header
    const name = ctx.settings.userName ? `, ${ctx.settings.userName}` : '';
    const summary: string[] = [];
    const dueToday = buckets.today.length;
    summary.push(dueToday ? `${dueToday} task${dueToday > 1 ? 's' : ''} planned for today` : 'Nothing scheduled for today');
    if (buckets.overdue.length) summary.push(`${buckets.overdue.length} overdue`);
    const activeProjects = snap.projects.filter((p) => p.status === 'active' && !p.archived);
    if (activeProjects.length) summary.push(`${activeProjects.length} active project${activeProjects.length > 1 ? 's' : ''}`);
    if (weekMin) summary.push(`${formatMinutes(weekMin)} logged this week`);
    const motto = daily?.motto ?? ctx.settings.motto;
    root.append(h('header', { class: 'sb-hero' },
      h('div', { class: 'sb-hero__date' }, fmt(t, ctx.settings.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
      h('h1', { class: 'sb-hero__title' }, `${greeting(now)}${name}.`),
      h('p', { class: 'sb-hero__summary' }, summary.join(' · ') + '.'),
      motto ? h('p', { class: 'sb-hero__motto' }, `“${motto}”`) : null,
      h('div', { class: 'sb-hero__tools' },
        st.editing
          ? button({ label: 'Done', icon: 'check', variant: 'primary', size: 'sm', onClick: () => { st.editing = false; ctx.saveSettings(); ctx.refresh(); } })
          : button({ icon: 'kanban', title: 'Customize dashboard', variant: 'ghost', size: 'sm', onClick: () => { st.editing = true; ctx.refresh(); } }))));

    if (!snap.ready) {
      root.append(h('div', { class: 'sb-grid' }, ...Array.from({ length: 4 }, () => card({ class: 'span-6' }, skeleton(4)))));
      return;
    }

    const grid = h('div', { class: ['sb-grid', 'sb-dashboard', st.editing && 'is-editing'] });
    const widgets = ctx.settings.dashboard;
    for (const w of widgets) {
      if (!w.visible && !st.editing) continue;
      let el: HTMLElement;
      try {
        el = WIDGETS[w.id](ctx, st);
      } catch (e) {
        el = card({ title: WIDGET_LABELS[w.id] }, h('p', { class: 'sb-muted' }, `Widget failed: ${e instanceof Error ? e.message : e}`));
      }
      el.classList.add(SPAN[w.id], 'sb-widget');
      el.dataset.widget = w.id;
      el.dataset.flip = `w-${w.id}`;
      if (st.editing) decorateEditable(ctx, el, w.id, !w.visible);
      grid.append(el);
    }
    if (st.editing) grid.prepend(h('div', { class: 'sb-edit-hint span-12' }, icon('grip', 14), 'Drag widgets to reorder · use the eye to hide · changes are saved automatically'));
    root.append(grid);
  },
  context(ctx, el) {
    const snap = ctx.snap();
    el.append(h('h4', { class: 'sb-context__title' }, 'Inbox'));
    const inbox = bucketTasks(snap.tasks, ctx.today(), ctx.settings.inboxFile).inbox;
    el.append(taskList(ctx, inbox.slice(0, 8), { compact: true, empty: h('p', { class: 'sb-muted' }, 'Inbox zero. Nice.') }));
    if (snap.duplicateIds.length) {
      el.append(h('h4', { class: 'sb-context__title' }, 'Data integrity'), h('p', { class: 'sb-muted' }, `Duplicate ids: ${snap.duplicateIds.join(', ')}`));
    }
    const issues = snap.entities.filter((e) => e.issues.length).slice(0, 6);
    if (issues.length) {
      el.append(h('h4', { class: 'sb-context__title' }, 'Metadata warnings'));
      for (const e of issues) el.append(entityRow(ctx, e, { meta: e.issues[0] }));
    }
  },
};

function decorateEditable(ctx: AppContext, el: HTMLElement, id: WidgetId, hidden: boolean) {
  el.classList.toggle('is-hidden-widget', hidden);
  el.setAttribute('draggable', 'true');
  const list = ctx.settings.dashboard;
  const idx = list.findIndex((w) => w.id === id);
  const move = (delta: number) => {
    const j = idx + delta;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j]!, list[idx]!];
    ctx.saveSettings();
    ctx.refresh();
  };
  const bar = h('div', { class: 'sb-widget__edit' },
    h('span', { class: 'sb-widget__grip' }, icon('grip', 14), WIDGET_LABELS[id]),
    button({ icon: 'chevron-up', title: 'Move earlier', variant: 'ghost', size: 'sm', onClick: () => move(-1), disabled: idx === 0 }),
    button({ icon: 'chevron-down', title: 'Move later', variant: 'ghost', size: 'sm', onClick: () => move(1), disabled: idx === list.length - 1 }),
    button({ icon: hidden ? 'eye-off' : 'eye', title: hidden ? 'Show widget' : 'Hide widget', variant: 'ghost', size: 'sm', onClick: () => { list[idx]!.visible = hidden; ctx.saveSettings(); ctx.refresh(); } }));
  el.prepend(bar);
  el.addEventListener('dragstart', (e) => { e.dataTransfer?.setData('text/sb-widget', id); el.classList.add('is-dragging'); });
  el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
  el.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('text/sb-widget')) { e.preventDefault(); el.classList.add('is-drop-target'); } });
  el.addEventListener('dragleave', () => el.classList.remove('is-drop-target'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('is-drop-target');
    const from = e.dataTransfer?.getData('text/sb-widget') as WidgetId | undefined;
    if (!from || from === id) return;
    const fi = list.findIndex((w) => w.id === from);
    const [item] = list.splice(fi, 1);
    const ti = list.findIndex((w) => w.id === id);
    list.splice(ti, 0, item!);
    ctx.saveSettings();
    ctx.refresh();
  });
}

type Widget = (ctx: AppContext, st: { editing: boolean; analytics: string }) => HTMLElement;

function pickFocusProject(ctx: AppContext, daily?: DailyNote): Project | undefined {
  const snap = ctx.snap();
  if (daily?.focusProject) {
    const p = snap.byBasename.get(daily.focusProject);
    if (p?.kind === 'project') return p;
  }
  const active = snap.projects.filter((p) => p.status === 'active' && !p.archived);
  return active.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.mtime - a.mtime)[0];
}

const WIDGETS: Record<WidgetId, Widget> = {
  focus(ctx) {
    const snap = ctx.snap();
    const t = ctx.today();
    const daily = snap.daily.find((d) => d.date === t);
    const project = pickFocusProject(ctx, daily);
    const todays = snap.tasks.filter((x) => x.indent === 0 && x.status !== 'cancelled' && (((x.due && x.due <= t) || (x.scheduled && x.scheduled <= t)) && isOpen(x) || x.done === t));
    const done = todays.filter((x) => x.status === 'done').length;
    const ratio = todays.length ? done / todays.length : null;
    const topTask = sortTasks(todays.filter(isOpen), t)[0];
    const focusText = daily?.focus || topTask?.text.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a: string, b: string) => b || a);

    const focusEl = h('div', { class: 'sb-focus__goal' });
    const renderFocus = () => {
      clear(focusEl);
      if (focusText) { focusEl.append(h('span', { class: 'sb-focus__text' }, focusText)); if (!daily?.focus) focusEl.append(h('span', { class: 'sb-focus__source' }, 'from your top task')); }
      else focusEl.append(h('span', { class: 'sb-focus__text is-placeholder' }, 'What matters most today?'));
    };
    renderFocus();
    const setFocus = () => {
      const input = h('input', { class: 'sb-focus__input', attrs: { type: 'text', placeholder: 'One sentence. The thing that makes today a win.', 'aria-label': 'Daily focus' } });
      input.value = daily?.focus ?? '';
      clear(focusEl);
      focusEl.append(input);
      input.focus();
      let done = false;
      const save = async (ok: boolean) => {
        if (done) return;
        done = true;
        if (!ok || input.value.trim() === (daily?.focus ?? '')) { renderFocus(); return; }
        await ctx.run('Focus set', async () => {
          const path = await ctx.actions.ensureDaily(t);
          await ctx.actions.setFrontmatter(path, { focus: input.value.trim() || undefined }, 'Set daily focus');
        }, { undoable: true });
      };
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') void save(true); if (e.key === 'Escape') void save(false); });
      input.addEventListener('blur', () => void save(true));
    };

    const prog = project ? projectProgress(snap, project) : null;
    return card({ class: 'sb-focus' },
      h('div', { class: 'sb-focus__top' },
        h('span', { class: 'sb-eyebrow' }, icon('focus', 13), 'Today’s focus'),
        button({ icon: 'edit', title: 'Set focus', variant: 'ghost', size: 'sm', onClick: setFocus })),
      focusEl,
      h('div', { class: 'sb-focus__bottom' },
        h('div', { class: 'sb-focus__progress' },
          progressRing(ratio, 52, 4),
          h('div', null,
            h('div', { class: 'sb-focus__label' }, 'Today'),
            h('div', { class: 'sb-focus__value sb-num' }, todays.length ? `${done} of ${todays.length} done` : 'No tasks planned'))),
        project
          ? h('div', { class: 'sb-focus__project' },
              h('div', { class: 'sb-focus__label' }, 'Main project'),
              h('a', { class: 'sb-focus__project-name', attrs: { href: '#' }, on: { click: (e: Event) => { e.preventDefault(); ctx.navigate(`project/${project.path}`); } } }, project.title),
              progressBar(prog?.ratio ?? null, { size: 'sm' }))
          : h('div', { class: 'sb-focus__project' }, h('div', { class: 'sb-focus__label' }, 'Main project'), h('span', { class: 'sb-muted' }, 'No active project')),
        h('div', { class: 'sb-focus__cta' },
          topTask
            ? button({ label: 'Continue', icon: 'play', variant: 'primary', onClick: () => (project && topTask.project === project.basename.toLowerCase() ? ctx.navigate(`project/${project.path}`) : ctx.navigate('today')) })
            : button({ label: 'Plan today', icon: 'today', variant: 'primary', onClick: () => ctx.navigate('today') }))));
  },

  quick(ctx) {
    const actions: [string, string, () => void, string?][] = [
      ['New task', 'tasks', () => ctx.capture('task'), 'C'],
      ['New note', 'knowledge', () => ctx.capture('note'), 'N'],
      ['New worklog', 'worklog', () => ctx.capture('worklog'), 'W'],
      ['New project', 'projects', () => ctx.capture('project')],
      ['Capture idea', 'zap', () => ctx.capture('idea')],
      ['Daily review', 'reviews', () => ctx.navigate('review/daily')],
    ];
    return card({ title: 'Quick actions', class: 'sb-quick' },
      h('div', { class: 'sb-quick__grid' }, ...actions.map(([label, ic, run, key]) =>
        h('button', { class: 'sb-quick__item', attrs: { type: 'button' }, on: { click: run } }, h('span', { class: 'sb-quick__icon' }, icon(ic, 17)), h('span', null, label), key ? h('kbd', { class: 'sb-kbd' }, key) : null))));
  },

  today(ctx) {
    const snap = ctx.snap();
    const t = ctx.today();
    const b = bucketTasks(snap.tasks, t, ctx.settings.inboxFile);
    const doneToday = snap.tasks.filter((x) => x.done === t).length;
    const logs = snap.worklogs.filter((w) => w.date === t);
    const logged = logs.reduce((a, w) => a + (w.minutes ?? 0), 0);
    const list = sortTasks([...b.overdue, ...b.today], t);
    const upcoming = b.upcoming.filter((x) => (x.due ?? x.scheduled)! <= addDays(t, 7)).slice(0, 3);
    return card({ title: 'Today', subtitle: fmt(t, ctx.settings.locale, { weekday: 'short', day: 'numeric', month: 'short' }), actions: [button({ label: 'Open', variant: 'ghost', size: 'sm', onClick: () => ctx.navigate('today') })] },
      h('div', { class: 'sb-stats' },
        stat({ label: 'Open', value: list.length }),
        stat({ label: 'Overdue', value: b.overdue.length }),
        stat({ label: 'Done', value: doneToday }),
        h('div', { class: 'sb-stat' }, h('span', { class: 'sb-stat__label' }, 'Logged'), h('span', { class: 'sb-stat__value sb-num' }, logged ? formatMinutes(logged) : '—'))),
      taskList(ctx, list, { compact: true, limit: 5, empty: emptyState({ compact: true, icon: 'check', title: 'All clear for today', text: 'Pull something from your inbox or enjoy the space.' }) }),
      upcoming.length ? h('div', { class: 'sb-subhead' }, 'Coming up') : null,
      upcoming.length ? taskList(ctx, upcoming, { compact: true }) : null,
      h('div', { class: 'sb-worklog-cta' },
        icon('worklog', 15),
        logs.length
          ? h('a', { attrs: { href: '#' }, on: { click: (e: Event) => { e.preventDefault(); ctx.open(logs[0]!.path); } } }, `${logs.length} worklog${logs.length > 1 ? 's' : ''} today · ${logs[0]!.title}`)
          : h('span', { class: 'sb-muted' }, 'No worklog yet today'),
        h('span', { class: 'sb-grow' }),
        button({ label: logs.length ? 'Add' : 'Log work', size: 'sm', variant: 'subtle', onClick: () => ctx.capture('worklog') })));
  },

  projects(ctx) {
    const snap = ctx.snap();
    const active = snap.projects.filter((p) => p.status === 'active' && !p.archived)
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.deadline ?? '9') .localeCompare(b.deadline ?? '9'));
    return card({ title: 'Projects', subtitle: `${active.length} active`, actions: [button({ label: 'All', variant: 'ghost', size: 'sm', onClick: () => ctx.navigate('projects') })] },
      active.length
        ? h('div', { class: 'sb-stack' }, ...active.slice(0, 4).map((p) => projectRow(ctx, p, { compact: true })))
        : emptyState({ compact: true, icon: 'projects', title: 'No active projects', action: button({ label: 'New project', size: 'sm', onClick: () => ctx.capture('project') }) }));
  },

  goals(ctx) {
    const snap = ctx.snap();
    const order = { year: 0, quarter: 1, vision: 2, month: 3, week: 4 } as const;
    const goals = snap.goals.filter((g) => g.status === 'active' && !g.archived).sort((a, b) => order[a.level] - order[b.level]).slice(0, 4);
    return card({ title: 'Goals', actions: [button({ label: 'All', variant: 'ghost', size: 'sm', onClick: () => ctx.navigate('goals') })] },
      goals.length
        ? h('div', { class: 'sb-goal-mini-list' }, ...goals.map((g) => {
            const gp = goalProgress(snap, g);
            const ms = nextMilestone(snap, g);
            const row = h('a', { class: 'sb-goal-mini', attrs: { href: '#' } },
              progressRing(gp.ratio, 40, 3.5),
              h('div', { class: 'sb-goal-mini__body' },
                h('div', { class: 'sb-goal-mini__title' }, g.title),
                h('div', { class: 'sb-goal-mini__meta' }, ms ? h('span', null, icon('flag', 12), ' ', ms.text.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a: string, b: string) => b || a)) : h('span', { class: 'sb-muted' }, gp.ratio === null ? gp.detail : `${g.level} goal`))));
            row.addEventListener('click', (e) => { e.preventDefault(); ctx.navigate(`goal/${g.path}`); });
            return row;
          }))
        : emptyState({ compact: true, icon: 'goals', title: 'No goals yet', text: 'Define what you’re working towards.', action: button({ label: 'New goal', size: 'sm', onClick: () => ctx.capture('goal') }) }));
  },

  knowledge(ctx) {
    const snap = ctx.snap();
    const t = ctx.today();
    const notes = snap.notes.filter((n) => !n.archived);
    const recent = [...notes].sort((a, b) => b.mtime - a.mtime).slice(0, 4);
    const weekAgo = new Date(t + 'T00:00:00').getTime() - 7 * 86400000;
    const added = notes.filter((n) => n.ctime >= weekAgo).length;
    const tagCount = new Map<string, number>();
    for (const n of notes) for (const tag of n.tags) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    const topics = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const old = rediscover(snap, t, 2);
    return card({ title: 'Knowledge', subtitle: `${notes.length} notes · ${added} new this week`, actions: [button({ label: 'Hub', variant: 'ghost', size: 'sm', onClick: () => ctx.navigate('knowledge') })] },
      recent.length ? h('div', { class: 'sb-list' }, ...recent.map((n) => entityRow(ctx, n, { meta: [n.topic, relTime(n.mtime)].filter(Boolean).join(' · ') }))) : emptyState({ compact: true, icon: 'knowledge', title: 'Your knowledge base is empty', action: button({ label: 'New note', size: 'sm', onClick: () => ctx.capture('note') }) }),
      topics.length ? h('div', { class: 'sb-tags' }, ...topics.map(([tag, n]) => chip(`#${tag}`, { onClick: () => ctx.palette(`#${tag}`), title: `${n} notes` }))) : null,
      old.length ? h('div', { class: 'sb-subhead' }, icon('sparkle', 12), ' Rediscover') : null,
      old.length ? h('div', { class: 'sb-list' }, ...old.map((n) => entityRow(ctx, n, { meta: `last edited ${relTime(n.mtime)}` }))) : null);
  },

  habits(ctx) {
    const snap = ctx.snap();
    const t = ctx.today();
    const habits = ctx.settings.habits;
    if (!habits.length) return card({ title: 'Habits' }, emptyState({ compact: true, icon: 'repeat', title: 'No habits configured', text: 'Add habits in the plugin settings.' }));
    const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
    const byDate = new Map(snap.daily.map((d) => [d.date, d]));
    const todayHabits = new Set(byDate.get(t)?.habits ?? []);
    const toggleHabit = (name: string) => ctx.run(todayHabits.has(name) ? `${name} unchecked` : `${name} done`, async () => {
      const path = await ctx.actions.ensureDaily(t);
      const cur = new Set(ctx.snap().daily.find((d) => d.date === t)?.habits ?? []);
      if (cur.has(name)) cur.delete(name);
      else cur.add(name);
      await ctx.actions.setFrontmatter(path, { habits: [...cur] }, 'Toggle habit');
    }, { undoable: true, silent: true });
    return card({ title: 'Habits', subtitle: 'Last 14 days' },
      h('div', { class: 'sb-habits' }, ...habits.map((name) => {
        const series = days.map((d) => ({ date: d, value: byDate.get(d)?.habits.includes(name) ? 1 : 0 }));
        const s = streak(series, t);
        const btn = h('button', { class: ['sb-habit__check', todayHabits.has(name) && 'is-done'], attrs: { type: 'button', 'aria-pressed': String(todayHabits.has(name)), 'aria-label': `${name} today` } }, icon('check', 13));
        btn.addEventListener('click', () => { btn.classList.toggle('is-done'); void toggleHabit(name); });
        return h('div', { class: 'sb-habit' },
          btn,
          h('span', { class: 'sb-habit__name' }, name),
          h('span', { class: 'sb-habit__dots' }, ...series.map((d) => h('i', { class: d.value ? 'is-on' : '', attrs: { title: d.date } }))),
          h('span', { class: 'sb-habit__streak sb-num', attrs: { 'data-tip': 'Current streak' } }, s ? `${s}d` : '—'));
      })));
  },

  analytics(ctx, st) {
    const snap = ctx.snap();
    const t = ctx.today();
    const from14 = addDays(t, -13);
    const body = h('div', { class: 'sb-analytics__body' });
    const dayLabel = (d: string) => fmt(d, ctx.settings.locale, { weekday: 'narrow' });
    const draw = (tab: string) => {
      st.analytics = tab;
      clear(body);
      if (tab === 'tasks') {
        const s = completedPerDay(snap, from14, t);
        const total = s.reduce((a, d) => a + d.value, 0);
        body.append(kpiRow([['Completed (14d)', total], ['Daily avg', total ? +(total / 14).toFixed(1) : 0, 1], ['Streak', streak(s, t), 0, 'd']]),
          total ? barChart(s.map((d) => ({ label: dayLabel(d.date), value: d.value, highlight: d.date === t, tip: `${d.date}: ${d.value} completed` })), { ariaLabel: 'Tasks completed per day, last 14 days' }) : emptyState({ compact: true, icon: 'tasks', title: 'No completed tasks in the last 14 days' }));
      } else if (tab === 'worklog') {
        const s = worklogMinutesPerDay(snap, from14, t);
        const total = s.reduce((a, d) => a + d.value, 0);
        const days = s.filter((d) => d.value > 0).length;
        body.append(kpiRow([['Hours (14d)', +(total / 60).toFixed(1), 1], ['Days logged', days], ['Avg / day', days ? +(total / 60 / days).toFixed(1) : 0, 1, 'h']]),
          total ? barChart(s.map((d) => ({ label: dayLabel(d.date), value: d.value, highlight: d.date === t, tip: `${d.date}: ${formatMinutes(d.value)}` })), { ariaLabel: 'Worklog minutes per day, last 14 days', format: formatMinutes }) : emptyState({ compact: true, icon: 'worklog', title: 'No worklogs in the last 14 days' }));
      } else if (tab === 'learning') {
        const s = learningActivity(snap, addDays(t, -83), t);
        const active = s.filter((d) => d.value > 0).length;
        body.append(kpiRow([['Active days (12w)', active], ['Streak', streak(s, t), 0, 'd'], ['Learning items', snap.learning.filter((l) => l.status === 'active').length]]),
          heatmap(s, { ariaLabel: 'Learning activity heatmap, last 12 weeks', locale: ctx.settings.locale, unit: 'activities' }));
      } else {
        const since = addDays(t, -29);
        const per = new Map<string, number>();
        for (const x of snap.tasks) if (x.status === 'done' && x.done && x.done >= since && x.project) per.set(x.project, (per.get(x.project) ?? 0) + 1);
        for (const w of snap.worklogs) if (w.date >= since && w.project) per.set(w.project, (per.get(w.project) ?? 0) + 1);
        const items = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ label: ctx.projectTitle(k), value: v, display: String(v) }));
        body.append(h('p', { class: 'sb-muted sb-small' }, 'Completed tasks + worklogs per project, last 30 days'),
          items.length ? shareBars(items) : emptyState({ compact: true, icon: 'projects', title: 'No project activity in the last 30 days' }));
        const goals = snap.goals.filter((g) => g.status === 'active').map((g) => ({ g, p: goalProgress(snap, g) })).filter((x) => x.p.ratio !== null).slice(0, 4);
        if (goals.length) {
          body.append(h('div', { class: 'sb-subhead' }, 'Goal progress'), shareBars(goals.map((x) => ({ label: x.g.title, value: x.p.ratio!, display: `${Math.round(x.p.ratio! * 100)}%` }))));
        }
      }
    };
    const el = card({ title: 'Personal analytics', class: 'sb-analytics', actions: [segmented([
      { id: 'tasks', label: 'Tasks' }, { id: 'worklog', label: 'Worklog' }, { id: 'learning', label: 'Learning' }, { id: 'projects', label: 'Projects' },
    ], st.analytics, (id) => { draw(id); enter(body, 0, 3); }, { size: 'sm', ariaLabel: 'Analytics view' })] }, body);
    draw(st.analytics);
    return el;
  },

  timeline(ctx) {
    const ev = activity(ctx.snap(), 12, 14, ctx.now().getTime());
    const week = completedPerDay(ctx.snap(), addDays(ctx.today(), -13), ctx.today()).map((d) => d.value);
    return card({ title: 'Activity', subtitle: 'Last 14 days', actions: [h('span', { class: 'sb-card__spark' }, sparkline(week, { width: 96, height: 24, ariaLabel: 'Completed tasks trend' }))] },
      ev.length ? timeline(ctx, ev) : emptyState({ compact: true, icon: 'clock', title: 'No recent activity' }));
  },
};

function kpiRow(items: [string, number, number?, string?][]) {
  return h('div', { class: 'sb-kpis' }, ...items.map(([label, value, decimals, suffix]) => {
    const v = h('span', { class: 'sb-kpi__value sb-num' });
    countUp(v, value, { decimals: decimals ?? 0, suffix: suffix ?? '' });
    return h('div', { class: 'sb-kpi' }, v, h('span', { class: 'sb-kpi__label' }, label));
  }));
}

function relTime(ts: number) {
  const d = Math.round((Date.now() - ts) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}
