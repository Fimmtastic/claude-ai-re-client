/**
 * Touch layer: gestures that make the app feel native on phones and tablets.
 * Everything here is opt-in per element, uses Pointer Events, moves elements
 * with transform only and never blocks vertical scrolling.
 */
import { icon } from './icons';
import { h } from './dom';
import { reducedMotion } from './motion';

export const isTouchDevice = () =>
  (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || document.body.classList.contains('is-mobile');

export const isPhoneWidth = () => typeof window !== 'undefined' && window.innerWidth <= 600;

/** Long press (default 480 ms). Cancels on movement > 8 px. Suppresses the following click. */
export function longPress(el: HTMLElement, cb: (pt: { x: number; y: number }) => void, ms = 480) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number } | null = null;
  let fired = false;
  const clear = () => { if (timer) clearTimeout(timer); timer = null; start = null; };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      fired = true;
      el.classList.add('is-pressed');
      setTimeout(() => el.classList.remove('is-pressed'), 180);
      cb(start ?? { x: e.clientX, y: e.clientY });
      clear();
    }, ms);
  });
  el.addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) clear(); });
  el.addEventListener('pointerup', clear);
  el.addEventListener('pointercancel', clear);
  el.addEventListener('click', (e) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
  el.addEventListener('contextmenu', (e) => { if (isTouchDevice()) e.preventDefault(); });
}

export interface SwipeAction {
  label: string;
  icon: string;
  tone: 'accent' | 'ok' | 'warn' | 'danger';
  run: () => void;
}

/**
 * iOS-style swipe actions on a row. Swipe right → `right` action, swipe left →
 * `left` action. Past the threshold the action is armed (icon scales); release
 * runs it. Vertical scrolling stays native (touch-action: pan-y).
 */
export function swipeRow(row: HTMLElement, actions: { right?: SwipeAction; left?: SwipeAction }) {
  const wrap = h('div', { class: 'sb-swipe' });
  const under = h('div', { class: 'sb-swipe__under' });
  const mkSide = (side: 'left' | 'right', a?: SwipeAction) =>
    a ? h('div', { class: ['sb-swipe__action', `is-${side}`, `tone-${a.tone}`] }, icon(a.icon, 18), h('span', null, a.label)) : null;
  const leftEl = mkSide('right', actions.right); // revealed on the left when swiping right
  const rightEl = mkSide('left', actions.left);
  if (leftEl) under.append(leftEl);
  if (rightEl) under.append(rightEl);
  const parent = row.parentElement;
  const next = row.nextSibling;
  wrap.append(under, row);
  if (parent) parent.insertBefore(wrap, next);
  // carry flip key so list animations keep working
  if (row.dataset.flip) { wrap.dataset.flip = row.dataset.flip; delete row.dataset.flip; }

  const THRESHOLD = 76;
  let x0 = 0, y0 = 0, dx = 0, active = false, decided = false, id = -1;
  row.style.touchAction = 'pan-y';
  row.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; active = true; decided = false; id = e.pointerId;
  });
  row.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!decided) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      decided = true;
      if (Math.abs(my) > Math.abs(mx)) { active = false; return; } // vertical scroll wins
      try { row.setPointerCapture(id); } catch { /* pointer already released (some WebViews) */ }
      wrap.classList.add('is-swiping');
    }
    dx = mx;
    if (dx > 0 && !actions.right) dx = 0;
    if (dx < 0 && !actions.left) dx = 0;
    const damp = Math.sign(dx) * Math.min(Math.abs(dx), 140 + Math.max(0, Math.abs(dx) - 140) * 0.25);
    row.style.transform = `translateX(${damp}px)`;
    wrap.classList.toggle('arm-right', dx > THRESHOLD);
    wrap.classList.toggle('arm-left', dx < -THRESHOLD);
    wrap.classList.toggle('show-right', dx > 0);
    wrap.classList.toggle('show-left', dx < 0);
  });
  const end = () => {
    if (!active) return;
    active = false;
    const fire = dx > THRESHOLD ? actions.right : dx < -THRESHOLD ? actions.left : undefined;
    const animateBack = () => {
      row.style.transition = reducedMotion() ? 'none' : 'transform 220ms cubic-bezier(.2,.8,.2,1)';
      row.style.transform = '';
      setTimeout(() => { row.style.transition = ''; wrap.classList.remove('is-swiping', 'arm-left', 'arm-right', 'show-left', 'show-right'); }, 230);
    };
    if (fire) {
      row.style.transition = reducedMotion() ? 'none' : 'transform 180ms cubic-bezier(.2,.8,.2,1)';
      row.style.transform = `translateX(${dx > 0 ? 110 : -110}%)`;
      setTimeout(() => { fire.run(); animateBack(); }, 170);
    } else animateBack();
    // swallow the click that follows a swipe
    if (Math.abs(dx) > 6) row.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true });
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  return wrap;
}

/** Swipe from the left screen edge to open, swipe left on the panel to close. */
export function edgeSwipe(root: HTMLElement, panel: HTMLElement, isOpen: () => boolean, setOpen: (v: boolean) => void) {
  let x0 = 0, y0 = 0, tracking: 'open' | 'close' | null = null;
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || root.clientWidth > 760) return;
    const r = root.getBoundingClientRect();
    if (!isOpen() && e.clientX - r.left < 22) tracking = 'open';
    else if (isOpen() && panel.contains(e.target as Node)) tracking = 'close';
    else return;
    x0 = e.clientX; y0 = e.clientY;
  }, true);
  root.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx)) { tracking = null; return; }
    if (tracking === 'open' && dx > 50) { setOpen(true); tracking = null; }
    else if (tracking === 'close' && dx < -50) { setOpen(false); tracking = null; }
  }, true);
  const stop = () => (tracking = null);
  root.addEventListener('pointerup', stop, true);
  root.addEventListener('pointercancel', stop, true);
}

/** Keeps --sb-vvh in sync with the visual viewport so sheets stay above the on-screen keyboard. */
export function trackVisualViewport(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const update = () => {
    document.documentElement.style.setProperty('--sb-vvh', `${vv.height}px`);
    document.body.classList.toggle('sb-keyboard-open', window.innerHeight - vv.height > 120);
  };
  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
}
