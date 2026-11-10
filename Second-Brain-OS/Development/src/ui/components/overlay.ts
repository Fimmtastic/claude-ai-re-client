import { h } from '../dom';
import { icon } from '../icons';
import { animate, EASE_OUT, EASE_IN_OUT } from '../motion';
import { button } from './basic';

/**
 * Overlays live in a single layer element inside the app root so they inherit
 * tokens and never leak into Obsidian's own modal stack.
 */

let layer: HTMLElement | null = null;
export function setOverlayLayer(el: HTMLElement) {
  layer = el;
}
function getLayer(): HTMLElement {
  if (!layer || !layer.isConnected) {
    layer = document.body.querySelector('.sb-overlay-layer') ?? h('div', { class: 'sb-overlay-layer sbos-root' });
    if (!layer.isConnected) document.body.append(layer);
  }
  return layer;
}

/* ─────────────────────────  Toasts  ───────────────────────── */

export interface ToastOpts {
  tone?: 'neutral' | 'ok' | 'error';
  action?: { label: string; run: () => void };
  duration?: number;
}

export function toast(message: string, opts: ToastOpts = {}) {
  const l = getLayer();
  let stack = l.querySelector<HTMLElement>('.sb-toasts');
  if (!stack) l.append((stack = h('div', { class: 'sb-toasts', attrs: { role: 'status', 'aria-live': 'polite' } })));
  const el = h('div', { class: ['sb-toast', `sb-toast--${opts.tone ?? 'neutral'}`] },
    icon(opts.tone === 'error' ? 'x' : opts.tone === 'ok' ? 'check' : 'sparkle', 15, 'sb-toast__icon'),
    h('span', { class: 'sb-toast__msg' }, message));
  let timer: ReturnType<typeof setTimeout>;
  const close = () => {
    clearTimeout(timer);
    const a = animate(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(.98)' }], { duration: 160, easing: EASE_IN_OUT, fill: 'forwards' });
    if (a) a.onfinish = () => el.remove();
    else el.remove();
  };
  if (opts.action) {
    el.append(h('button', { class: 'sb-toast__action', attrs: { type: 'button' }, on: { click: () => { opts.action!.run(); close(); } } }, opts.action.label));
  }
  el.append(h('button', { class: 'sb-toast__close', attrs: { type: 'button', 'aria-label': 'Dismiss' }, on: { click: close } }, icon('x', 13)));
  stack.append(el);
  while (stack.children.length > 3) stack.firstElementChild?.remove();
  animate(el, [{ opacity: 0, transform: 'translateY(10px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE_OUT });
  timer = setTimeout(close, opts.duration ?? (opts.action ? 6000 : 3200));
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => (timer = setTimeout(close, 2000)));
}

/* ─────────────────────────  Modal  ───────────────────────── */

export interface ModalHandle {
  el: HTMLElement;
  body: HTMLElement;
  close: () => void;
  onClose: (fn: () => void) => void;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function modal(o: { title?: string; width?: number; class?: string; position?: 'center' | 'top'; dismissable?: boolean }): ModalHandle {
  const l = getLayer();
  const prevFocus = document.activeElement as HTMLElement | null;
  const body = h('div', { class: 'sb-modal__body' });
  const dialog = h('div', {
    class: ['sb-modal', o.position === 'top' && 'sb-modal--top', o.class],
    style: { maxWidth: `${o.width ?? 560}px` },
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title ?? 'Dialog' },
  },
    o.title ? h('header', { class: 'sb-modal__header' }, h('h2', null, o.title), h('button', { class: 'sb-modal__close', attrs: { type: 'button', 'aria-label': 'Close' }, on: { click: () => close() } }, icon('x', 15))) : null,
    body);
  const backdrop = h('div', { class: ['sb-backdrop', o.position === 'top' && 'sb-backdrop--top'] }, dialog);
  const closers: (() => void)[] = [];
  let closed = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const f = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  function close() {
    if (closed) return;
    closed = true;
    dialog.removeEventListener('keydown', onKey, true);
    closers.forEach((c) => c());
    const a = animate(dialog, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(4px) scale(.985)' }], { duration: 140, easing: EASE_IN_OUT, fill: 'forwards' });
    animate(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: EASE_IN_OUT, fill: 'forwards' });
    const done = () => { backdrop.remove(); prevFocus?.focus?.({ preventScroll: true }); };
    if (a) a.onfinish = done;
    else done();
  }
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop && o.dismissable !== false) close(); });
  dialog.addEventListener('keydown', onKey, true);
  l.append(backdrop);
  animate(backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: EASE_OUT });
  animate(dialog, [{ opacity: 0, transform: 'translateY(8px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE_OUT });
  requestAnimationFrame(() => {
    if (!dialog.contains(document.activeElement)) (dialog.querySelector<HTMLElement>('[autofocus], input, textarea') ?? dialog.querySelector<HTMLElement>(FOCUSABLE))?.focus();
  });
  return { el: dialog, body, close, onClose: (fn) => closers.push(fn) };
}

export function confirm(o: { title: string; text: string; confirm?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const m = modal({ title: o.title, width: 420 });
    m.body.append(
      h('p', { class: 'sb-modal__text' }, o.text),
      h('div', { class: 'sb-modal__footer' },
        button({ label: 'Cancel', variant: 'ghost', onClick: () => m.close() }),
        button({ label: o.confirm ?? 'Confirm', variant: o.danger ? 'danger' : 'primary', onClick: () => { result = true; m.close(); }, attrs: { autofocus: '' } })));
    m.onClose(() => resolve(result));
  });
}

/* ─────────────────────────  Menus (dropdown + context)  ───────────────────────── */

export interface MenuItem {
  label: string;
  icon?: string;
  hint?: string;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
  run?: () => void;
  separator?: boolean;
}

let openMenu: (() => void) | null = null;

export function menu(items: MenuItem[], anchor: { x: number; y: number } | HTMLElement, opts: { align?: 'start' | 'end'; minWidth?: number } = {}) {
  openMenu?.();
  const l = getLayer();
  const list = h('div', { class: 'sb-menu', attrs: { role: 'menu' }, style: { minWidth: `${opts.minWidth ?? 200}px` } });
  const buttons: HTMLButtonElement[] = [];
  for (const it of items) {
    if (it.separator) { list.append(h('div', { class: 'sb-menu__sep', attrs: { role: 'separator' } })); continue; }
    const b = h('button', { class: ['sb-menu__item', it.danger && 'is-danger', it.checked && 'is-checked'], attrs: { role: 'menuitem', type: 'button' } },
      h('span', { class: 'sb-menu__icon' }, it.checked ? icon('check', 14) : it.icon ? icon(it.icon, 14) : null),
      h('span', { class: 'sb-menu__label' }, it.label),
      it.hint ? h('span', { class: 'sb-menu__hint' }, it.hint) : null);
    b.disabled = !!it.disabled;
    b.addEventListener('click', () => { close(); it.run?.(); });
    buttons.push(b);
    list.append(b);
  }
  l.append(list);
  // position
  const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 };
  const mw = list.offsetWidth;
  const mh = list.offsetHeight;
  let x = opts.align === 'end' ? rect.right - mw : rect.left;
  let y = rect.bottom + 6;
  if (y + mh > window.innerHeight - 8) y = Math.max(8, rect.top - mh - 6);
  x = Math.max(8, Math.min(x, window.innerWidth - mw - 8));
  list.style.left = `${x}px`;
  list.style.top = `${y}px`;
  list.style.transformOrigin = y < rect.top ? 'bottom' : 'top';
  animate(list, [{ opacity: 0, transform: 'scale(.97) translateY(-3px)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: EASE_OUT });
  buttons[0]?.focus({ preventScroll: true });

  const onDown = (e: MouseEvent) => { if (!list.contains(e.target as Node)) close(); };
  const onKey = (e: KeyboardEvent) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); (anchor instanceof HTMLElement ? anchor : null)?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length]?.focus(); }
  };
  setTimeout(() => document.addEventListener('mousedown', onDown, true));
  document.addEventListener('keydown', onKey, true);
  function close() {
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    if (openMenu === close) openMenu = null;
    const a = animate(list, [{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: EASE_IN_OUT, fill: 'forwards' });
    if (a) a.onfinish = () => list.remove();
    else list.remove();
  }
  openMenu = close;
  return close;
}

/* ─────────────────────────  Tooltips  ───────────────────────── */

/** Delegated tooltip for any element with [data-tip]. One element, no per-node listeners. */
export function installTooltips(root: HTMLElement) {
  const tip = h('div', { class: 'sb-tooltip', attrs: { role: 'tooltip' } });
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: HTMLElement | null = null;
  const show = (el: HTMLElement) => {
    const text = el.dataset.tip;
    if (!text) return;
    tip.textContent = text;
    getLayer().append(tip);
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    let x = r.left + r.width / 2 - tw / 2;
    x = Math.max(6, Math.min(x, window.innerWidth - tw - 6));
    let y = r.bottom + 8;
    if (y + tip.offsetHeight > window.innerHeight - 6) y = r.top - tip.offsetHeight - 8;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.classList.add('is-visible');
  };
  const hide = () => {
    if (timer) clearTimeout(timer);
    tip.classList.remove('is-visible');
    current = null;
  };
  root.addEventListener('pointerover', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (!el || el === current) return;
    hide();
    current = el;
    timer = setTimeout(() => show(el), 450);
  });
  root.addEventListener('pointerout', (e) => {
    const to = e.relatedTarget as HTMLElement | null;
    if (current && to && current.contains(to)) return;
    hide();
  });
  root.addEventListener('pointerdown', hide, true);
  root.addEventListener('focusin', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (el && (e.target as HTMLElement).matches(':focus-visible')) { current = el; show(el); }
  });
  root.addEventListener('focusout', hide);
  return () => tip.remove();
}
