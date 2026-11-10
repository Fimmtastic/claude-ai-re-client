/**
 * Tiny DOM toolkit. No virtual DOM: pages render into containers and
 * re-render on data change, preserving scroll + focus. This keeps the bundle
 * small and integrates cleanly with Obsidian's own DOM.
 */

type Child = Node | string | number | null | undefined | false | Child[];
type Handler = (ev: never) => void;

export interface Props {
  class?: string | (string | false | null | undefined)[];
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
  dataset?: Record<string, string>;
  attrs?: Record<string, string | number | boolean | undefined>;
  text?: string;
  html?: string;
  on?: Partial<Record<keyof HTMLElementEventMap, Handler>>;
  ref?: (el: HTMLElement) => void;
  [key: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, children);
  return el;
}

export function applyProps(el: HTMLElement | SVGElement, props: Props) {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    switch (k) {
      case 'class':
        el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v));
        break;
      case 'style':
        for (const [sk, sv] of Object.entries(v as Record<string, string>)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else (el.style as unknown as Record<string, string>)[sk] = sv;
        }
        break;
      case 'dataset':
        for (const [dk, dv] of Object.entries(v as Record<string, string>)) (el as HTMLElement).dataset[dk] = dv;
        break;
      case 'attrs':
        for (const [ak, av] of Object.entries(v as Record<string, unknown>)) {
          if (av === false || av === undefined) continue;
          el.setAttribute(ak, av === true ? '' : String(av));
        }
        break;
      case 'text':
        el.textContent = String(v);
        break;
      case 'html':
        el.innerHTML = String(v);
        break;
      case 'on':
        for (const [ev, fn] of Object.entries(v as Record<string, EventListener>)) el.addEventListener(ev, fn);
        break;
      case 'ref':
        (v as (e: Element) => void)(el);
        break;
      default:
        if (k in el && typeof v !== 'object') (el as unknown as Record<string, unknown>)[k] = v;
        else el.setAttribute(k, String(v));
    }
  }
}

export function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: (SVGElement | null | false)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.appendChild(c);
  return el;
}

/** Keeps scrollTop of all `[data-scroll-key]` containers across a re-render. */
export function preserveScroll(root: HTMLElement, fn: () => void) {
  const saved = new Map<string, number>();
  root.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach((el) => saved.set(el.dataset.scrollKey!, el.scrollTop));
  const active = document.activeElement as HTMLElement | null;
  const focusKey = active?.dataset?.focusKey;
  fn();
  root.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach((el) => {
    const v = saved.get(el.dataset.scrollKey!);
    if (v !== undefined) el.scrollTop = v;
  });
  if (focusKey) root.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.closest?.('.cm-editor');
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';

export function kbd(...keys: string[]) {
  return h('span', { class: 'sb-kbd-group' }, ...keys.map((k) => h('kbd', { class: 'sb-kbd' }, k)));
}
