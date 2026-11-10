import { h } from '../dom';
import { icon } from '../icons';
import { chip, priorityMark } from './basic';
import { menu, confirm } from './overlay';
import { pulse, animate, EASE_SPRING } from '../motion';
import type { Task, Priority } from '../../core/types';
import type { AppContext } from '../../views/context';
import { addDays, diffDays, relativeDay } from '../../core/dates';
import { isTouchDevice, longPress, swipeRow } from '../touch';

/** Renders text with [[links]] as interactive spans (no innerHTML of user data). */
export function richText(ctx: AppContext, text: string, fromPath: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) frag.append(text.slice(last, m.index));
    const target = m[1]!;
    const a = h('a', { class: 'sb-wikilink', attrs: { href: '#', tabindex: '-1' } }, m[2] ?? target.split('/').pop()!);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = ctx.port.resolveLink(target, fromPath);
      if (p) ctx.open(p);
    });
    frag.append(a);
    last = m.index! + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

export interface TaskRowOpts {
  showProject?: boolean;
  showFile?: boolean;
  compact?: boolean;
  draggable?: boolean;
  /** disable swipe actions (e.g. inside boards or rows with extra controls) */
  noSwipe?: boolean;
}

export function taskRow(ctx: AppContext, t: Task, opts: TaskRowOpts = {}): HTMLElement {
  const todayISO = ctx.today();
  const done = t.status === 'done' || t.status === 'cancelled';
  const check = h('button', {
    class: ['sb-check', `is-${t.status}`],
    attrs: { type: 'button', role: 'checkbox', 'aria-checked': String(t.status === 'done'), 'aria-label': done ? 'Mark as not done' : 'Complete task', 'data-tip': t.status === 'doing' ? 'In progress' : undefined },
  }, h('span', { class: 'sb-check__box' }, icon('check', 12, 'sb-check__mark')));

  const text = h('span', { class: 'sb-task__text', dataset: { focusKey: `task-${t.id}` } }, richText(ctx, t.text, t.path));
  const meta = h('span', { class: 'sb-task__meta' });
  if (t.milestone) meta.append(chip('Milestone', { icon: 'flag', tone: 'accent' }));
  if (t.recurrence) meta.append(h('span', { class: 'sb-task__repeat', attrs: { 'data-tip': t.recurrence } }, icon('repeat', 13)));
  if (opts.showProject !== false && t.project) {
    const proj = ctx.snap().byBasename.get(t.project);
    if (proj && !t.path.endsWith(`/${proj.basename}.md`) || (proj && opts.showFile)) meta.append(chip(proj.title, { icon: 'projects', onClick: () => ctx.open(proj.path) }));
    else if (proj && opts.showProject) meta.append(chip(proj.title, { icon: 'projects', onClick: () => ctx.open(proj.path) }));
  }
  const date = t.due ?? t.scheduled;
  if (date && !done) {
    const n = diffDays(date, todayISO);
    meta.append(chip(relativeDay(date, todayISO, ctx.settings.locale), { icon: t.due ? 'calendar' : 'clock', tone: n < 0 ? 'danger' : n === 0 ? 'accent' : 'neutral', title: t.due ? `Due ${date}` : `Scheduled ${date}` }));
  } else if (done && t.done) {
    meta.append(h('span', { class: 'sb-task__done-date sb-num' }, relativeDay(t.done, todayISO, ctx.settings.locale)));
  }
  const prio = priorityMark(t.priority);
  if (prio) meta.append(prio);

  const row = h('div', {
    class: ['sb-task', `is-${t.status}`, opts.compact && 'sb-task--compact', t.indent > 0 && 'is-sub'],
    dataset: { flip: `task-${t.id}`, taskId: t.id },
    attrs: { tabindex: '0', role: 'listitem', draggable: opts.draggable ? 'true' : undefined },
  }, check, h('div', { class: 'sb-task__body' }, text, meta));

  const toggle = () => {
    const next = t.status === 'done' ? 'todo' : 'done';
    row.classList.add(next === 'done' ? 'is-completing' : 'is-reopening');
    if (next === 'done') {
      pulse(check);
      animate(check.querySelector('.sb-check__mark')!, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: EASE_SPRING });
    }
    void ctx.run(next === 'done' ? 'Task completed' : 'Task reopened', () => ctx.actions.setTaskStatus(t, next), { undoable: true });
  };
  check.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

  const openMenu = (anchor: HTMLElement | { x: number; y: number }) => taskMenu(ctx, t, anchor, () => startEdit());
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY }); });
  const more = h('button', { class: 'sb-task__more', attrs: { type: 'button', 'aria-label': 'Task actions' } }, icon('more', 15));
  more.addEventListener('click', (e) => { e.stopPropagation(); openMenu(more); });
  row.append(more);

  const startEdit = () => {
    const input = h('input', { class: 'sb-task__edit', attrs: { type: 'text', 'aria-label': 'Edit task' } });
    input.value = t.text;
    text.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = (save: boolean) => {
      if (finished) return;
      finished = true;
      if (save && input.value.trim() && input.value.trim() !== t.text) void ctx.run('Task renamed', () => ctx.actions.setTaskText(t, input.value), { undoable: true });
      else input.replaceWith(text);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  };
  text.addEventListener('dblclick', startEdit);
  row.addEventListener('keydown', (e) => {
    if (e.target !== row) return;
    if (e.key === ' ' || e.key === 'x') { e.preventDefault(); toggle(); }
    else if (e.key === 'Enter') { e.preventDefault(); startEdit(); }
    else if (e.key === 'e') { e.preventDefault(); ctx.edit(t.path, { line: t.line }); }
    else if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); siblingTask(row, 1)?.focus(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); siblingTask(row, -1)?.focus(); }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); openMenu(more); }
  });
  if (opts.draggable) {
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/sb-task', t.id);
      e.dataTransfer!.effectAllowed = 'move';
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
  }
  if (isTouchDevice()) {
    longPress(row, (pt) => openMenu(pt));
    if (!opts.noSwipe && !opts.draggable) {
      const today = ctx.today();
      return swipeRow(row, {
        right: done
          ? { label: 'Reopen', icon: 'undo', tone: 'accent', run: () => void ctx.run('Task reopened', () => ctx.actions.setTaskStatus(t, 'todo'), { undoable: true }) }
          : { label: 'Done', icon: 'check', tone: 'ok', run: () => void ctx.run('Task completed', () => ctx.actions.setTaskStatus(t, 'done'), { undoable: true }) },
        left: done ? undefined : { label: 'Tomorrow', icon: 'calendar', tone: 'warn', run: () => void ctx.run('Moved to tomorrow', () => ctx.actions.setTaskDue(t, addDays(today, 1)), { undoable: true }) },
      });
    }
  }
  return row;
}

function siblingTask(row: HTMLElement, dir: 1 | -1): HTMLElement | null {
  const list = row.closest('.sb-tasklist, .sb-board__list, .sb-vlist');
  if (!list) return null;
  const all = [...list.querySelectorAll<HTMLElement>('.sb-task')];
  return all[all.indexOf(row) + dir] ?? null;
}

export function taskMenu(ctx: AppContext, t: Task, anchor: HTMLElement | { x: number; y: number }, edit?: () => void) {
  const d = ctx.today();
  const setPrio = (p: Priority) => () => ctx.run('Priority updated', () => ctx.actions.setTaskPriority(t, p), { undoable: true });
  menu([
    t.status !== 'done' ? { label: 'Complete', icon: 'check', hint: 'Space', run: () => ctx.run('Task completed', () => ctx.actions.setTaskStatus(t, 'done'), { undoable: true }) } : { label: 'Reopen', icon: 'undo', run: () => ctx.run('Task reopened', () => ctx.actions.setTaskStatus(t, 'todo'), { undoable: true }) },
    t.status !== 'doing' && t.status !== 'done' ? { label: 'Start (in progress)', icon: 'play', run: () => ctx.run('Task started', () => ctx.actions.setTaskStatus(t, 'doing'), { undoable: true }) } : { label: 'Back to todo', icon: 'tasks', run: () => ctx.run('Task updated', () => ctx.actions.setTaskStatus(t, 'todo'), { undoable: true }) },
    { separator: true, label: '' },
    { label: 'Due today', icon: 'today', run: () => ctx.run('Rescheduled', () => ctx.actions.setTaskDue(t, d), { undoable: true }) },
    { label: 'Due tomorrow', icon: 'calendar', run: () => ctx.run('Rescheduled', () => ctx.actions.setTaskDue(t, addDays(d, 1)), { undoable: true }) },
    { label: 'Due next week', icon: 'calendar', run: () => ctx.run('Rescheduled', () => ctx.actions.setTaskDue(t, addDays(d, 7)), { undoable: true }) },
    { label: 'Remove due date', icon: 'x', disabled: !t.due, run: () => ctx.run('Due date removed', () => ctx.actions.setTaskDue(t, undefined), { undoable: true }) },
    { separator: true, label: '' },
    { label: 'Priority: High', icon: 'flag', checked: t.priority === 'high', run: setPrio('high') },
    { label: 'Priority: Medium', icon: 'flag', checked: t.priority === 'medium', run: setPrio('medium') },
    { label: 'Priority: None', icon: 'flag', checked: t.priority === 'none', run: setPrio('none') },
    { separator: true, label: '' },
    ...(edit ? [{ label: 'Rename', icon: 'edit', hint: 'Enter', run: edit }] : []),
    { label: 'Open in note', icon: 'external', hint: 'E', run: () => ctx.edit(t.path, { line: t.line }) },
    { label: 'Delete task', icon: 'trash', danger: true, run: async () => { if (await confirm({ title: 'Delete task?', text: `“${t.text}” will be removed from ${t.path.split('/').pop()}. You can undo this.`, confirm: 'Delete', danger: true })) void ctx.run('Task deleted', () => ctx.actions.deleteTask(t), { undoable: true }); } },
  ], anchor, { title: t.text.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a: string, b: string) => b || a) });
}

export function taskList(ctx: AppContext, tasks: Task[], opts: TaskRowOpts & { empty?: HTMLElement; limit?: number } = {}) {
  const list = h('div', { class: 'sb-tasklist', attrs: { role: 'list' } });
  const shown = opts.limit ? tasks.slice(0, opts.limit) : tasks;
  for (const t of shown) list.append(taskRow(ctx, t, opts));
  if (!tasks.length && opts.empty) return opts.empty;
  if (opts.limit && tasks.length > opts.limit) list.append(h('div', { class: 'sb-tasklist__more' }, `+ ${tasks.length - opts.limit} more`));
  return list;
}
