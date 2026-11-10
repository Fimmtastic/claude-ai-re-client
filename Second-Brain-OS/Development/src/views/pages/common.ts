import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { chip, priorityMark, progressBar, statusDot } from '../../ui/components/basic';
import type { AppContext } from '../context';
import type { ActivityEvent, Entity, Project } from '../../core/types';
import { KIND_ICON, KIND_LABEL } from '../meta';
import { nextAction, projectProgress } from '../../core/queries';
import { fmt, relativeDay, relativeTime, diffDays } from '../../core/dates';

export function entityRow(ctx: AppContext, e: Entity, opts: { meta?: string | Node; showKind?: boolean; trailing?: Node | null } = {}) {
  const row = h('a', { class: 'sb-row', attrs: { href: '#' }, dataset: { flip: `e-${e.path}` } },
    h('span', { class: 'sb-row__icon' }, icon(KIND_ICON[e.kind], 16)),
    h('span', { class: 'sb-row__main' },
      h('span', { class: 'sb-row__title' }, e.title),
      h('span', { class: 'sb-row__meta' }, opts.showKind ? `${KIND_LABEL[e.kind]} · ` : '', opts.meta ?? relativeTime(e.mtime))),
    opts.trailing ?? null);
  row.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (ev.metaKey || ev.ctrlKey) ctx.edit(e.path, { newLeaf: true });
    else ctx.open(e.path);
  });
  return row;
}

export function projectRow(ctx: AppContext, p: Project, opts: { compact?: boolean } = {}) {
  const snap = ctx.snap();
  const prog = projectProgress(snap, p);
  const next = nextAction(snap, p, ctx.today());
  const deadline = p.deadline ? diffDays(p.deadline, ctx.today()) : undefined;
  const row = h('a', { class: ['sb-project-row', opts.compact && 'is-compact'], attrs: { href: '#' }, dataset: { flip: `p-${p.path}` } },
    h('div', { class: 'sb-project-row__head' },
      h('span', { class: 'sb-project-row__title' }, p.title),
      priorityMark(p.priority),
      h('span', { class: 'sb-grow' }),
      deadline !== undefined && p.status !== 'done' ? chip(relativeDay(p.deadline!, ctx.today(), ctx.settings.locale), { icon: 'flag', tone: deadline < 0 ? 'danger' : deadline <= 7 ? 'warn' : 'neutral', title: `Deadline ${p.deadline}` }) : null,
      statusDot(p.status)),
    h('div', { class: 'sb-project-row__progress' },
      progressBar(prog.ratio, { size: 'sm' }),
      h('span', { class: 'sb-num sb-muted' }, prog.total ? `${prog.done}/${prog.total}` : 'No tasks')),
    !opts.compact || next
      ? h('div', { class: 'sb-project-row__next' }, icon('arrow', 13), p.status === 'done' ? h('span', { class: 'sb-muted' }, 'Completed') : next ? h('span', null, next.text.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a: string, b: string) => b || a)) : h('span', { class: 'sb-muted' }, 'No next action defined'))
      : null);
  row.addEventListener('click', (e) => { e.preventDefault(); ctx.navigate(`project/${p.path}`); });
  return row;
}

export function timeline(ctx: AppContext, events: ActivityEvent[]) {
  const wrap = h('div', { class: 'sb-timeline' });
  let lastDay = '';
  for (const ev of events) {
    if (ev.date !== lastDay) {
      lastDay = ev.date;
      wrap.append(h('div', { class: 'sb-timeline__day' }, relativeDay(ev.date, ctx.today(), ctx.settings.locale) === 'Today' ? 'Today' : fmt(ev.date, ctx.settings.locale, { weekday: 'long', day: 'numeric', month: 'long' })));
    }
    const item = h('a', { class: ['sb-timeline__item', `is-${ev.verb}`], attrs: { href: '#' } },
      h('span', { class: 'sb-timeline__dot' }, icon(ev.verb === 'completed' ? 'check' : ev.kind === 'task' ? 'tasks' : KIND_ICON[ev.kind as Entity['kind']] ?? 'file', 12)),
      h('span', { class: 'sb-timeline__text' },
        h('span', { class: 'sb-timeline__verb' }, ev.verb === 'completed' ? 'Completed' : ev.verb === 'created' ? `New ${ev.kind === 'task' ? 'task' : KIND_LABEL[ev.kind as Entity['kind']].toLowerCase()}` : 'Edited'),
        h('span', { class: 'sb-timeline__title' }, ev.title.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a: string, b: string) => b || a))),
      h('span', { class: 'sb-timeline__time sb-num' }, new Intl.DateTimeFormat(ctx.settings.locale, { hour: '2-digit', minute: '2-digit' }).format(ev.ts)));
    item.addEventListener('click', (e) => { e.preventDefault(); ctx.open(ev.path); });
    wrap.append(item);
  }
  return wrap;
}

export function propList(rows: [string, Node | string | null | undefined][]) {
  return h('dl', { class: 'sb-props' }, ...rows.filter(([, v]) => v !== null && v !== undefined && v !== '').flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v as Node | string)]));
}

export function filterBar(...children: (HTMLElement | null)[]) {
  return h('div', { class: 'sb-filterbar' }, ...children);
}

/** Simple windowed list for very large collections (fixed row height). */
export function virtualList<T>(items: T[], rowHeight: number, render: (item: T, i: number) => HTMLElement, opts: { height?: number; key: string } ) {
  if (items.length <= 120) {
    return h('div', { class: 'sb-vlist is-static' }, ...items.map(render));
  }
  const viewport = h('div', { class: 'sb-vlist', style: { height: `${opts.height ?? 560}px` }, dataset: { scrollKey: opts.key } });
  const spacer = h('div', { class: 'sb-vlist__spacer', style: { height: `${items.length * rowHeight}px` } });
  const layer = h('div', { class: 'sb-vlist__layer' });
  spacer.append(layer);
  viewport.append(spacer);
  let first = -1;
  const draw = () => {
    const start = Math.max(0, Math.floor(viewport.scrollTop / rowHeight) - 6);
    if (start === first) return;
    first = start;
    const count = Math.ceil((opts.height ?? 560) / rowHeight) + 12;
    layer.style.transform = `translateY(${start * rowHeight}px)`;
    layer.replaceChildren(...items.slice(start, start + count).map((it, i) => {
      const el = render(it, start + i);
      el.style.height = `${rowHeight}px`;
      return el;
    }));
  };
  viewport.addEventListener('scroll', () => requestAnimationFrame(draw), { passive: true });
  requestAnimationFrame(draw);
  draw();
  return viewport;
}

export function greeting(d: Date): string {
  const hr = d.getHours();
  if (hr < 5) return 'Good night';
  if (hr < 12) return 'Good morning';
  if (hr < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "1 note" / "3 notes" */
export const plural = (n: number, word: string, pl = word + 's') => `${n} ${n === 1 ? word : pl}`;
