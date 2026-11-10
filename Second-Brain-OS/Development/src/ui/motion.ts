/**
 * Motion language
 * ───────────────
 *  duration: fast 140ms (hover, press) · base 200ms (enter, menus) · slow 240ms (pages, modals)
 *  easing:   out  cubic-bezier(.2,.8,.2,1)  — things arriving
 *            in-out cubic-bezier(.4,0,.2,1) — things moving
 *            spring cubic-bezier(.34,1.4,.64,1) — confirmations (task done)
 *  only transform + opacity; respects prefers-reduced-motion & settings.
 */

export const EASE_OUT = 'cubic-bezier(.2,.8,.2,1)';
export const EASE_IN_OUT = 'cubic-bezier(.4,0,.2,1)';
export const EASE_SPRING = 'cubic-bezier(.34,1.4,.64,1)';

let override: 'system' | 'on' | 'off' = 'system';
export function setMotionPreference(p: 'system' | 'on' | 'off') {
  override = p;
  document.body.classList.toggle('sb-reduce-motion', reducedMotion());
}

export function reducedMotion(): boolean {
  if (override === 'on') return true;
  if (override === 'off') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function animate(el: Element, keyframes: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (reducedMotion() || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(keyframes, { fill: 'none', ...opts });
}

export function enter(el: Element, delay = 0, distance = 6) {
  return animate(el, [
    { opacity: 0, transform: `translateY(${distance}px)` },
    { opacity: 1, transform: 'none' },
  ], { duration: 240, delay, easing: EASE_OUT, fill: 'backwards' });
}

/** Staggered entrance for a set of elements (cap so long lists stay snappy). */
export function stagger(els: Iterable<Element>, step = 28, max = 10, distance = 6) {
  let i = 0;
  for (const el of els) {
    enter(el, Math.min(i, max) * step, distance);
    i++;
  }
}

export function pageTransition(el: HTMLElement, dir: 'forward' | 'back' | 'none') {
  const dx = dir === 'forward' ? 8 : dir === 'back' ? -8 : 0;
  return animate(el, [
    { opacity: 0, transform: `translate(${dx}px, 4px)` },
    { opacity: 1, transform: 'none' },
  ], { duration: 220, easing: EASE_OUT });
}

/** Animated number counter. Uses textContent only (no layout thrash). */
export function countUp(el: HTMLElement, to: number, opts: { duration?: number; decimals?: number; suffix?: string; from?: number } = {}) {
  const decimals = opts.decimals ?? 0;
  const suffix = opts.suffix ?? '';
  const fmt = (n: number) => n.toFixed(decimals) + suffix;
  if (reducedMotion() || to === 0) {
    el.textContent = fmt(to);
    return;
  }
  const from = opts.from ?? 0;
  const dur = opts.duration ?? 700;
  const t0 = performance.now();
  el.textContent = fmt(from);
  const tick = (t: number) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Smooth collapse/expand using a measured height on a wrapper (one-off, not per frame). */
export function toggleCollapse(el: HTMLElement, open: boolean) {
  if (reducedMotion()) {
    el.hidden = !open;
    return;
  }
  if (open) {
    el.hidden = false;
    const hgt = el.scrollHeight;
    el.animate([{ height: '0px', opacity: 0 }, { height: `${hgt}px`, opacity: 1 }], { duration: 200, easing: EASE_OUT });
  } else {
    const hgt = el.scrollHeight;
    const a = el.animate([{ height: `${hgt}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 180, easing: EASE_IN_OUT });
    a.onfinish = () => (el.hidden = true);
  }
}

/** FLIP: animate elements from their previous positions after a DOM change. */
export function flip(container: HTMLElement, mutate: () => void, selector = '[data-flip]') {
  if (reducedMotion()) return mutate();
  const first = new Map<string, DOMRect>();
  container.querySelectorAll<HTMLElement>(selector).forEach((el) => first.set(el.dataset.flip!, el.getBoundingClientRect()));
  mutate();
  container.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    const f = first.get(el.dataset.flip!);
    if (!f) {
      enter(el, 0, 4);
      return;
    }
    const l = el.getBoundingClientRect();
    const dx = f.left - l.left;
    const dy = f.top - l.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: EASE_IN_OUT });
  });
}

export function pulse(el: Element) {
  return animate(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 320, easing: EASE_SPRING });
}

export function exitAndRemove(el: HTMLElement, opts: { duration?: number; y?: number } = {}): Promise<void> {
  return new Promise((resolve) => {
    const a = animate(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${opts.y ?? 4}px) scale(.98)` }], { duration: opts.duration ?? 160, easing: EASE_IN_OUT, fill: 'forwards' });
    if (!a) {
      el.remove();
      resolve();
      return;
    }
    a.onfinish = () => {
      el.remove();
      resolve();
    };
  });
}
