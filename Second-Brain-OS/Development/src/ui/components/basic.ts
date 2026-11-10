import { h, Props } from '../dom';
import { icon } from '../icons';
import { animate, countUp, EASE_OUT, isQuiet } from '../motion';

/* ─────────────────────────  Buttons  ───────────────────────── */

export interface ButtonOpts {
  label?: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  title?: string;
  shortcut?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick?: (ev: MouseEvent) => unknown;
  class?: string;
  attrs?: Record<string, string>;
}

export function button(o: ButtonOpts): HTMLButtonElement {
  const b = h('button', {
    class: ['sb-btn', `sb-btn--${o.variant ?? 'secondary'}`, `sb-btn--${o.size ?? 'md'}`, !o.label && 'sb-btn--icon', o.class],
    attrs: { type: 'button', 'aria-label': o.title ?? o.label, 'data-tip': o.title && !o.label ? o.title : undefined, ...o.attrs },
  },
    o.icon ? icon(o.icon, o.size === 'sm' ? 15 : 16) : null,
    o.label ? h('span', { class: 'sb-btn__label' }, o.label) : null,
    o.shortcut ? h('kbd', { class: 'sb-kbd sb-btn__kbd' }, o.shortcut) : null,
  );
  b.disabled = !!o.disabled;
  if (o.loading) setLoading(b, true);
  if (o.onClick)
    b.addEventListener('click', async (ev) => {
      if (b.disabled || b.classList.contains('is-loading')) return;
      const r = o.onClick!(ev);
      if (r instanceof Promise) {
        setLoading(b, true);
        try {
          await r;
        } finally {
          setLoading(b, false);
        }
      }
    });
  return b;
}

export function setLoading(b: HTMLElement, on: boolean) {
  b.classList.toggle('is-loading', on);
  b.setAttribute('aria-busy', String(on));
}

export function iconButton(name: string, title: string, onClick: (ev: MouseEvent) => void, extra: Partial<ButtonOpts> = {}) {
  return button({ icon: name, title, onClick, variant: 'ghost', size: 'sm', ...extra });
}

/* ─────────────────────────  Chips / badges  ───────────────────────── */

export function chip(text: string, opts: { tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'ok'; icon?: string; onClick?: () => void; title?: string } = {}) {
  const el = h(opts.onClick ? 'button' : 'span', {
    class: ['sb-chip', `sb-chip--${opts.tone ?? 'neutral'}`, opts.onClick && 'is-clickable'],
    attrs: { title: opts.title, type: opts.onClick ? 'button' : undefined },
  }, opts.icon ? icon(opts.icon, 12) : null, h('span', null, text));
  if (opts.onClick) el.addEventListener('click', (e) => { e.stopPropagation(); opts.onClick!(); });
  return el;
}

const STATUS_TONE: Record<string, string> = {
  active: 'accent', doing: 'accent', planned: 'neutral', paused: 'warn', done: 'ok', achieved: 'ok', archived: 'neutral', dropped: 'neutral', todo: 'neutral', cancelled: 'neutral',
};

export function statusDot(status: string, label = true) {
  return h('span', { class: ['sb-status', `sb-status--${STATUS_TONE[status] ?? 'neutral'}`] }, h('span', { class: 'sb-status__dot' }), label ? h('span', null, cap(status)) : null);
}

const PRIO_LABEL: Record<string, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: '' };
export function priorityMark(p: string) {
  if (p === 'none') return null;
  return h('span', { class: ['sb-prio', `sb-prio--${p}`], attrs: { 'data-tip': `${PRIO_LABEL[p]} priority`, 'aria-label': `${PRIO_LABEL[p]} priority` } },
    h('i'), h('i'), h('i'));
}

export const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/* ─────────────────────────  Progress  ───────────────────────── */

/** ratio null → indeterminate "no data" state (never fake 0%). */
export function progressBar(ratio: number | null, opts: { size?: 'sm' | 'md'; label?: boolean; delay?: number } = {}) {
  const fill = h('span', { class: 'sb-progress__fill' });
  const el = h('div', {
    class: ['sb-progress', `sb-progress--${opts.size ?? 'md'}`, ratio === null && 'is-empty'],
    attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': ratio === null ? undefined : Math.round(ratio * 100) },
  }, h('span', { class: 'sb-progress__track' }, fill));
  if (ratio !== null) {
    fill.style.transform = `scaleX(${ratio})`;
    animate(fill, [{ transform: 'scaleX(0)' }, { transform: `scaleX(${ratio})` }], { duration: 640, delay: opts.delay ?? 80, easing: EASE_OUT, fill: 'backwards' });
  }
  if (opts.label) el.append(h('span', { class: 'sb-progress__label sb-num' }, ratio === null ? '—' : `${Math.round(ratio * 100)}%`));
  return el;
}

export function progressRing(ratio: number | null, size = 44, stroke = 3.5) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const wrap = h('div', { class: ['sb-ring', ratio === null && 'is-empty'], style: { width: `${size}px`, height: `${size}px` } });
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle class="sb-ring__track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"/><circle class="sb-ring__fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  const label = h('span', { class: 'sb-ring__label sb-num' }, ratio === null ? '—' : '0');
  wrap.append(label);
  if (ratio !== null) {
    const fill = wrap.querySelector<SVGCircleElement>('.sb-ring__fill')!;
    const target = c * (1 - ratio);
    if (isQuiet()) { fill.style.transition = 'none'; fill.style.strokeDashoffset = String(target); }
    else requestAnimationFrame(() => (fill.style.strokeDashoffset = String(target)));
    countUp(label, Math.round(ratio * 100), { suffix: '%', duration: 700 });
  }
  return wrap;
}

/* ─────────────────────────  Layout primitives  ───────────────────────── */

export interface CardOpts {
  title?: string;
  subtitle?: string;
  icon?: string;
  actions?: (HTMLElement | null)[];
  class?: string;
  onClick?: () => void;
  id?: string;
}

export function card(o: CardOpts, ...body: (Node | null | false | undefined)[]) {
  const header = o.title
    ? h('header', { class: 'sb-card__header' },
        h('div', { class: 'sb-card__titles' },
          h('h3', { class: 'sb-card__title' }, o.icon ? icon(o.icon, 15, 'sb-card__icon') : null, o.title),
          o.subtitle ? h('span', { class: 'sb-card__subtitle' }, o.subtitle) : null),
        o.actions?.length ? h('div', { class: 'sb-card__actions' }, ...o.actions) : null)
    : null;
  const el = h('section', { class: ['sb-card', o.onClick && 'is-interactive', o.class], dataset: o.id ? { widget: o.id } : undefined }, header, ...body.filter(Boolean) as Node[]);
  if (o.onClick) {
    el.tabIndex = 0;
    el.addEventListener('click', o.onClick);
    el.addEventListener('keydown', (e) => e.key === 'Enter' && o.onClick!());
  }
  return el;
}

export function pageHeader(o: { eyebrow?: string; title: string; subtitle?: string | Node; actions?: (HTMLElement | null)[] }) {
  return h('header', { class: 'sb-page__header' },
    h('div', { class: 'sb-page__heading' },
      o.eyebrow ? h('div', { class: 'sb-eyebrow' }, o.eyebrow) : null,
      h('h1', { class: 'sb-page__title' }, o.title),
      o.subtitle ? h('p', { class: 'sb-page__subtitle' }, o.subtitle) : null),
    o.actions?.length ? h('div', { class: 'sb-page__actions' }, ...o.actions) : null);
}

export function sectionTitle(text: string, extra?: HTMLElement | null, count?: number) {
  return h('div', { class: 'sb-section-title' }, h('h2', null, text, count !== undefined ? h('span', { class: 'sb-count sb-num' }, String(count)) : null), extra ?? null);
}

export function emptyState(o: { icon?: string; title: string; text?: string; action?: HTMLElement | null; compact?: boolean }) {
  return h('div', { class: ['sb-empty', o.compact && 'sb-empty--compact'] },
    h('div', { class: 'sb-empty__icon' }, icon(o.icon ?? 'sparkle', o.compact ? 18 : 22)),
    h('div', { class: 'sb-empty__title' }, o.title),
    o.text ? h('p', { class: 'sb-empty__text' }, o.text) : null,
    o.action ?? null);
}

export function skeleton(lines = 3, opts: { height?: number } = {}) {
  return h('div', { class: 'sb-skeleton', attrs: { 'aria-busy': 'true', 'aria-label': 'Loading' } },
    ...Array.from({ length: lines }, (_, i) => h('div', { class: 'sb-skeleton__line', style: { width: `${[92, 76, 84, 60, 70][i % 5]}%`, height: `${opts.height ?? 12}px` } })));
}

export function stat(o: { label: string; value: number | null; suffix?: string; decimals?: number; hint?: string; icon?: string }) {
  const v = h('span', { class: 'sb-stat__value sb-num' });
  if (o.value === null) v.textContent = '—';
  else countUp(v, o.value, { suffix: o.suffix, decimals: o.decimals });
  return h('div', { class: 'sb-stat' },
    h('span', { class: 'sb-stat__label' }, o.icon ? icon(o.icon, 13) : null, o.label), v,
    o.hint ? h('span', { class: 'sb-stat__hint' }, o.hint) : null);
}

/* ─────────────────────────  Segmented control / tabs  ───────────────────────── */

export function segmented<T extends string>(items: { id: T; label: string; icon?: string; count?: number }[], active: T, onChange: (id: T) => void, opts: { size?: 'sm' | 'md'; ariaLabel?: string } = {}) {
  const el = h('div', { class: ['sb-seg', `sb-seg--${opts.size ?? 'md'}`], attrs: { role: 'tablist', 'aria-label': opts.ariaLabel } });
  const indicator = h('span', { class: 'sb-seg__indicator' });
  el.append(indicator);
  const btns: HTMLButtonElement[] = [];
  const place = (b: HTMLElement | undefined, animateIt: boolean) => {
    if (!b) return;
    indicator.style.transition = animateIt ? '' : 'none';
    indicator.style.width = `${b.offsetWidth}px`;
    indicator.style.transform = `translateX(${b.offsetLeft - 3}px)`;
    if (!animateIt) requestAnimationFrame(() => (indicator.style.transition = ''));
  };
  for (const it of items) {
    const b = h('button', { class: ['sb-seg__item', it.id === active && 'is-active'], attrs: { role: 'tab', type: 'button', 'aria-selected': String(it.id === active) } },
      it.icon ? icon(it.icon, 14) : null, h('span', null, it.label), it.count !== undefined ? h('span', { class: 'sb-seg__count sb-num' }, String(it.count)) : null);
    b.addEventListener('click', () => {
      btns.forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', String(x === b)); });
      place(b, true);
      onChange(it.id);
    });
    b.addEventListener('keydown', (e) => {
      const i = btns.indexOf(b);
      if (e.key === 'ArrowRight') btns[(i + 1) % btns.length]?.focus();
      if (e.key === 'ArrowLeft') btns[(i - 1 + btns.length) % btns.length]?.focus();
    });
    btns.push(b);
    el.append(b);
  }
  // position after layout
  const ro = new ResizeObserver(() => place(btns.find((b) => b.classList.contains('is-active')), false));
  ro.observe(el);
  requestAnimationFrame(() => place(btns.find((b) => b.classList.contains('is-active')), false));
  return el;
}

/* ─────────────────────────  Form fields  ───────────────────────── */

export function field(label: string, control: HTMLElement, hint?: string) {
  return h('label', { class: 'sb-field' }, h('span', { class: 'sb-field__label' }, label), control, hint ? h('span', { class: 'sb-field__hint' }, hint) : null);
}

export function textInput(o: { value?: string; placeholder?: string; type?: string; autofocus?: boolean; onInput?: (v: string) => void; onEnter?: (v: string) => void; class?: string; props?: Props }) {
  const i = h('input', { class: ['sb-input', o.class], attrs: { type: o.type ?? 'text', placeholder: o.placeholder, spellcheck: 'false' }, ...o.props });
  i.value = o.value ?? '';
  if (o.onInput) i.addEventListener('input', () => o.onInput!(i.value));
  if (o.onEnter) i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); o.onEnter!(i.value); } });
  if (o.autofocus) requestAnimationFrame(() => i.focus());
  return i;
}

export function textArea(o: { value?: string; placeholder?: string; rows?: number; onInput?: (v: string) => void }) {
  const t = h('textarea', { class: 'sb-input sb-textarea', attrs: { placeholder: o.placeholder, rows: o.rows ?? 3 } });
  t.value = o.value ?? '';
  if (o.onInput) t.addEventListener('input', () => o.onInput!(t.value));
  return t;
}

export function select<T extends string>(options: { value: T; label: string }[], value: T, onChange: (v: T) => void) {
  const sel = h('select', { class: 'sb-input sb-select' }, ...options.map((o) => h('option', { attrs: { value: o.value } }, o.label)));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value as T));
  return sel;
}

export function toggle(checked: boolean, onChange: (v: boolean) => void, label?: string) {
  const input = h('input', { attrs: { type: 'checkbox', role: 'switch' } });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'sb-switch' }, input, h('span', { class: 'sb-switch__track' }, h('span', { class: 'sb-switch__thumb' })), label ? h('span', { class: 'sb-switch__label' }, label) : null);
}

/* ─────────────────────────  Slider  ───────────────────────── */

export function slider(o: { label: string; min: number; max: number; step: number; value: number; format: (v: number) => string; onInput: (v: number) => void; disabled?: boolean }) {
  const input = h('input', { class: 'sb-range', attrs: { type: 'range', min: o.min, max: o.max, step: o.step, 'aria-label': o.label } });
  input.value = String(o.value);
  input.disabled = !!o.disabled;
  const out = h('span', { class: 'sb-range__value sb-num' }, o.format(o.value));
  const paint = () => input.style.setProperty('--p', `${((Number(input.value) - o.min) / (o.max - o.min)) * 100}%`);
  paint();
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = o.format(v);
    paint();
    o.onInput(v);
  });
  return h('label', { class: ['sb-slider', o.disabled && 'is-disabled'] }, h('span', { class: 'sb-slider__head' }, h('span', { class: 'sb-slider__label' }, o.label), out), input);
}
