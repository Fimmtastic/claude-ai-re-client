import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { button, card, chip, emptyState, pageHeader, progressBar, progressRing, sectionTitle, segmented, statusDot, cap, textInput } from '../../ui/components/basic';
import { menu } from '../../ui/components/overlay';
import { taskList } from '../../ui/components/task-row';
import type { AppContext, PageDef } from '../context';
import type { Goal, GoalLevel, GoalStatus } from '../../core/types';
import { goalChildren, goalProgress, goalProjects, goalTasks, nextMilestone, sortTasks, isOpen } from '../../core/queries';
import { diffDays, fmt } from '../../core/dates';
import { projectRow, propList } from './common';
import { quickAdd } from './tasks';

const LEVELS: { id: GoalLevel; label: string }[] = [
  { id: 'vision', label: 'Long-term vision' }, { id: 'year', label: 'Yearly goals' }, { id: 'quarter', label: 'Quarterly goals' }, { id: 'month', label: 'Monthly milestones' }, { id: 'week', label: 'Weekly actions' },
];

function goalCard(ctx: AppContext, g: Goal) {
  const snap = ctx.snap();
  const gp = goalProgress(snap, g);
  const ms = nextMilestone(snap, g);
  const projects = goalProjects(snap, g);
  const children = goalChildren(snap, g);
  const days = g.due ? diffDays(g.due, ctx.today()) : undefined;
  const c = card({ class: 'sb-goal-card', onClick: () => ctx.navigate(`goal/${g.path}`) },
    h('div', { class: 'sb-goal-card__top' },
      progressRing(gp.ratio, 56, 4),
      h('div', { class: 'sb-goal-card__head' },
        h('div', { class: 'sb-eyebrow' }, g.area ?? cap(g.level)),
        h('h3', { class: 'sb-goal-card__title' }, g.title),
        h('div', { class: 'sb-goal-card__detail sb-muted sb-small' }, gp.source === 'none' ? 'No measurable data yet' : gp.source === 'metric' ? gp.detail : `Derived from ${projects.length ? `${projects.length} project${projects.length > 1 ? 's' : ''}` : ''}${projects.length && children.length ? ' + ' : ''}${children.length ? `${children.length} sub-goal${children.length > 1 ? 's' : ''}` : ''}${!projects.length && !children.length ? 'tasks' : ''}`))),
    h('div', { class: 'sb-goal-card__foot' },
      ms ? h('span', { class: 'sb-goal-card__ms' }, icon('flag', 12), ms.text.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a: string, b: string) => b || a)) : h('span', { class: 'sb-muted sb-small' }, 'No next milestone'),
      h('span', { class: 'sb-grow' }),
      g.status !== 'active' ? statusDot(g.status) : days !== undefined ? chip(days < 0 ? `${-days}d overdue` : `${days}d left`, { tone: days < 0 ? 'danger' : days < 14 ? 'warn' : 'neutral', icon: 'calendar' }) : null));
  c.dataset.flip = `g-${g.path}`;
  return c;
}

export const GoalsPage: PageDef = {
  id: 'goals',
  nav: 'goals',
  title: () => 'Goals',
  actions: (ctx) => [button({ label: 'New goal', icon: 'plus', size: 'sm', variant: 'ghost', onClick: () => ctx.capture('goal') })],
  render(ctx, root) {
    const st = ctx.state('goals', { area: '', show: 'active' as 'active' | 'all' });
    const snap = ctx.snap();
    const goals = snap.goals.filter((g) => !g.archived && (st.show === 'all' || g.status === 'active'));
    const areas = [...new Set(snap.goals.map((g) => g.area).filter((x): x is string => !!x))].sort();
    root.append(pageHeader({ eyebrow: 'Goals & Personal Development', title: 'Goals', subtitle: 'From long-term vision to this week’s actions. Progress is only shown where real data exists.' }));
    root.append(h('div', { class: 'sb-toolbar' },
      segmented([{ id: '', label: 'All areas' }, ...areas.map((a) => ({ id: a, label: a }))], st.area, (v) => { st.area = v; ctx.refresh(); }, { ariaLabel: 'Life area' }),
      h('span', { class: 'sb-grow' }),
      segmented([{ id: 'active', label: 'Active' }, { id: 'all', label: 'All' }], st.show, (v) => { st.show = v as 'active' | 'all'; ctx.refresh(); }, { size: 'sm' })));
    const filtered = goals.filter((g) => !st.area || g.area === st.area);
    if (!filtered.length) {
      root.append(emptyState({ icon: 'goals', title: 'No goals here yet', text: 'Start with a yearly goal, then break it into quarterly goals and link projects to it.', action: button({ label: 'Define a goal', variant: 'primary', onClick: () => ctx.capture('goal') }) }));
      return;
    }
    for (const lvl of LEVELS) {
      const arr = filtered.filter((g) => g.level === lvl.id);
      if (!arr.length) continue;
      root.append(sectionTitle(lvl.label, null, arr.length), h('div', { class: 'sb-goal-grid' }, ...arr.map((g) => goalCard(ctx, g))));
    }
  },
  context(ctx, el) {
    const snap = ctx.snap();
    const byArea = new Map<string, Goal[]>();
    for (const g of snap.goals.filter((x) => x.status === 'active')) (byArea.get(g.area ?? 'Other') ?? byArea.set(g.area ?? 'Other', []).get(g.area ?? 'Other')!).push(g);
    el.append(h('h4', { class: 'sb-context__title' }, 'Areas'));
    for (const [a, arr] of byArea) {
      const ratios = arr.map((g) => goalProgress(snap, g).ratio).filter((r): r is number => r !== null);
      el.append(h('div', { class: 'sb-area-row' }, h('span', null, a), h('span', { class: 'sb-muted sb-num' }, `${arr.length}`), progressBar(ratios.length ? ratios.reduce((x, y) => x + y, 0) / ratios.length : null, { size: 'sm' })));
    }
  },
};

export const GoalPage: PageDef = {
  id: 'goal',
  nav: 'goals',
  crumbs: () => [{ label: 'Goals', route: 'goals' }],
  title: (ctx, path) => ctx.snap().byPath.get(path ?? '')?.title ?? 'Goal',
  actions: (ctx, path) => [button({ icon: 'edit', label: 'Edit note', size: 'sm', variant: 'ghost', onClick: () => path && ctx.edit(path) })],
  render(ctx, root, path) {
    const snap = ctx.snap();
    const g = snap.byPath.get(path ?? '');
    if (!g || g.kind !== 'goal') {
      root.append(emptyState({ icon: 'goals', title: 'Goal not found', action: button({ label: 'All goals', onClick: () => ctx.navigate('goals') }) }));
      return;
    }
    const gp = goalProgress(snap, g);
    const parent = g.parent ? snap.byBasename.get(g.parent) : undefined;
    const statusBtn = button({ label: cap(g.status), size: 'sm', variant: 'subtle', onClick: (e) => menu((['active', 'achieved', 'paused', 'dropped'] as GoalStatus[]).map((s) => ({ label: cap(s), checked: g.status === s, run: () => ctx.run(`Goal ${s}`, () => ctx.actions.setFrontmatter(g.path, { status: s }, 'Change goal status'), { undoable: true }) })), e.currentTarget as HTMLElement) });
    statusBtn.prepend(statusDot(g.status, false));
    root.append(h('header', { class: 'sb-detail-head' },
      h('div', { class: 'sb-detail-head__main' },
        h('div', { class: 'sb-eyebrow' }, icon('goals', 13), `${LEVELS.find((l) => l.id === g.level)?.label ?? g.level}${g.area ? ' · ' + g.area : ''}`),
        h('h1', { class: 'sb-page__title' }, g.title),
        g.description ? h('p', { class: 'sb-page__subtitle' }, g.description) : null,
        h('div', { class: 'sb-detail-head__chips' }, statusBtn,
          g.due ? chip(`Due ${fmt(g.due, ctx.settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })}`, { icon: 'calendar' }) : null,
          parent ? chip(`↑ ${parent.title}`, { onClick: () => ctx.open(parent.path) }) : null)),
      progressRing(gp.ratio, 84, 5)));
    root.append(h('p', { class: 'sb-muted sb-small sb-gp-source' }, gp.source === 'none' ? 'Progress unknown: link projects, add sub-goals, tasks, or a target/current metric.' : `Progress source: ${gp.source} · ${gp.detail}`));

    const main = h('div', { class: 'sb-col' });
    const side = h('div', { class: 'sb-col sb-col--side' });

    if (g.target !== undefined) {
      const cur = g.current ?? 0;
      const input = textInput({ type: 'number', value: String(cur), class: 'sb-input--sm sb-metric__input' });
      const save = (v: number) => ctx.run('Progress updated', async () => {
        await ctx.actions.setFrontmatter(g.path, { current: v }, 'Update goal metric');
        await ctx.actions.appendToSection(g.path, ['verlauf', 'history', 'log'], `- ${ctx.today()}: ${cur} → ${v}${g.unit ? ' ' + g.unit : ''}`);
      }, { undoable: true });
      main.append(card({ title: 'Measurement', icon: 'goals' },
        h('div', { class: 'sb-metric' },
          h('span', { class: 'sb-metric__value sb-num' }, `${cur}`), h('span', { class: 'sb-metric__target sb-num' }, `/ ${g.target} ${g.unit ?? ''}`),
          h('span', { class: 'sb-grow' }),
          button({ icon: 'chevron-down', title: 'Decrease', size: 'sm', onClick: () => save(cur - 1) }),
          input,
          button({ icon: 'chevron-up', title: 'Increase', size: 'sm', onClick: () => save(cur + 1) }),
          button({ label: 'Set', size: 'sm', variant: 'primary', onClick: () => { const v = Number(input.value); if (isFinite(v)) void save(v); } })),
        progressBar(gp.ratio, { label: true })));
    }

    const projects = goalProjects(snap, g);
    main.append(sectionTitle('Projects', button({ label: 'New project', icon: 'plus', size: 'sm', variant: 'ghost', onClick: () => ctx.capture('project', { goal: g.basename }) }), projects.length));
    main.append(projects.length ? h('div', { class: 'sb-stack' }, ...projects.map((p) => projectRow(ctx, p))) : h('p', { class: 'sb-muted sb-small' }, `Add “goals: [[${g.basename}]]” to a project to drive this goal.`));

    const tasks = goalTasks(snap, g);
    main.append(sectionTitle('Next actions & milestones', null, tasks.filter(isOpen).length));
    main.append(quickAdd(ctx, { target: g.path, placeholder: 'Add an action for this goal…' }));
    main.append(taskList(ctx, sortTasks(tasks.filter(isOpen), ctx.today()), { empty: h('p', { class: 'sb-muted sb-small' }, 'No open actions.') }));

    const children = goalChildren(snap, g);
    side.append(card({ title: 'Sub-goals', icon: 'layers', actions: [button({ icon: 'plus', title: 'Add sub-goal', size: 'sm', variant: 'ghost', onClick: () => ctx.capture('goal') })] },
      children.length ? h('div', { class: 'sb-goal-mini-list' }, ...children.map((c) => {
        const cp = goalProgress(snap, c);
        const row = h('a', { class: 'sb-goal-mini', attrs: { href: '#' } }, progressRing(cp.ratio, 34, 3), h('div', { class: 'sb-goal-mini__body' }, h('div', { class: 'sb-goal-mini__title' }, c.title), h('div', { class: 'sb-goal-mini__meta sb-muted' }, cap(c.level))));
        row.addEventListener('click', (e) => { e.preventDefault(); ctx.navigate(`goal/${c.path}`); });
        return row;
      })) : h('p', { class: 'sb-muted sb-small' }, `Sub-goals set “parent: [[${g.basename}]]”.`)));
    const done = tasks.filter((t) => t.status === 'done');
    side.append(card({ title: 'History', icon: 'clock' }, done.length ? taskList(ctx, done.slice(0, 8), { compact: true }) : h('p', { class: 'sb-muted sb-small' }, 'Completed actions and metric updates appear here.')));
    root.append(h('div', { class: 'sb-split' }, main, side));
  },
  context(ctx, el, path) {
    const g = ctx.snap().byPath.get(path ?? '');
    if (!g || g.kind !== 'goal') return;
    el.append(h('h4', { class: 'sb-context__title' }, 'Properties'), propList([['Level', g.level], ['Status', g.status], ['Area', g.area], ['Due', g.due], ['Target', g.target !== undefined ? `${g.current ?? 0} / ${g.target} ${g.unit ?? ''}` : undefined], ['ID', h('code', null, g.id)]]));
  },
};
