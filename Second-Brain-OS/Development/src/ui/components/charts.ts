import { h, s } from '../dom';
import { animate, EASE_OUT } from '../motion';
import type { ISODate } from '../../core/types';
import { parseISO } from '../../core/dates';

/**
 * Quiet, monochrome-first charts in SVG. One accent hue; the current period
 * is emphasised, the rest stays neutral. Every chart has an accessible label
 * and native <title> tooltips per datum.
 */

export interface Datum {
  label: string;
  value: number;
  tip?: string;
  highlight?: boolean;
}

export function barChart(data: Datum[], opts: { height?: number; ariaLabel: string; format?: (v: number) => string; showLabels?: boolean } ) {
  const H = opts.height ?? 96;
  const W = Math.max(data.length * 14, 120);
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 3;
  const bw = (W - gap * (data.length - 1)) / Math.max(1, data.length);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'sb-chart__svg', role: 'img', 'aria-label': opts.ariaLabel });
  // baseline
  svg.append(s('line', { x1: 0, x2: W, y1: H - 0.5, y2: H - 0.5, class: 'sb-chart__base' }));
  data.forEach((d, i) => {
    const bh = d.value === 0 ? 1.5 : Math.max(3, (d.value / max) * (H - 6));
    const rect = s('rect', { x: i * (bw + gap), y: H - bh, width: Math.max(1, bw), height: bh, rx: Math.min(3, bw / 2), class: ['sb-chart__bar', d.highlight ? 'is-hl' : '', d.value === 0 ? 'is-zero' : ''].join(' ') });
    const title = s('title');
    title.textContent = d.tip ?? `${d.label}: ${opts.format ? opts.format(d.value) : d.value}`;
    rect.append(title);
    svg.append(rect);
    animate(rect, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 420, delay: 60 + i * 12, easing: EASE_OUT, fill: 'backwards' });
  });
  const wrap = h('div', { class: 'sb-chart' }, svg);
  if (opts.showLabels !== false && data.length <= 14) {
    wrap.append(h('div', { class: 'sb-chart__labels', style: { gridTemplateColumns: `repeat(${data.length}, 1fr)` } }, ...data.map((d) => h('span', { class: d.highlight ? 'is-hl' : '' }, d.label))));
  }
  return wrap;
}

export function sparkline(values: number[], opts: { width?: number; height?: number; ariaLabel: string }) {
  const W = opts.width ?? 120;
  const H = opts.height ?? 32;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? W / (values.length - 1) : W;
  const pts = values.map((v, i) => [i * step, H - 2 - (v / max) * (H - 4)] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${W} ${H} L0 ${H} Z`;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'sb-spark', role: 'img', 'aria-label': opts.ariaLabel },
    s('path', { d: area, class: 'sb-spark__area' }),
    s('path', { d, class: 'sb-spark__line', fill: 'none' }));
  const last = pts[pts.length - 1];
  if (last) svg.append(s('circle', { cx: last[0], cy: last[1], r: 2.2, class: 'sb-spark__dot' }));
  const path = svg.querySelector('.sb-spark__line') as SVGPathElement;
  const len = W * 1.6;
  path.style.strokeDasharray = String(len);
  animate(path, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 800, easing: EASE_OUT, fill: 'backwards' });
  return svg;
}

/** Contribution-style heatmap: columns = weeks, rows = Mon..Sun. */
export function heatmap(series: { date: ISODate; value: number }[], opts: { ariaLabel: string; cell?: number; locale: string; unit?: string }) {
  const cell = opts.cell ?? 11;
  const gap = 3;
  const max = Math.max(1, ...series.map((d) => d.value));
  if (!series.length) return h('div');
  const first = parseISO(series[0]!.date);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const cols = Math.ceil((series.length + offset) / 7);
  const W = cols * (cell + gap);
  const Hh = 7 * (cell + gap);
  const svg = s('svg', { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, class: 'sb-heat', role: 'img', 'aria-label': opts.ariaLabel });
  series.forEach((d, i) => {
    const idx = i + offset;
    const x = Math.floor(idx / 7) * (cell + gap);
    const y = (idx % 7) * (cell + gap);
    const level = d.value === 0 ? 0 : Math.min(4, Math.ceil((d.value / max) * 4));
    const r = s('rect', { x, y, width: cell, height: cell, rx: 2.5, class: `sb-heat__cell l${level}` });
    const t = s('title');
    t.textContent = `${new Intl.DateTimeFormat(opts.locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(parseISO(d.date))}: ${d.value}${opts.unit ? ' ' + opts.unit : ''}`;
    r.append(t);
    svg.append(r);
  });
  animate(svg, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE_OUT });
  return h('div', { class: 'sb-heat-wrap' }, svg);
}

/** Horizontal share bars (e.g. time per project). */
export function shareBars(items: { label: string; value: number; display: string }[]) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return h('div', { class: 'sb-share' }, ...items.map((it, i) => {
    const fill = h('span', { class: 'sb-share__fill', style: { transform: `scaleX(${it.value / max})` } });
    animate(fill, [{ transform: 'scaleX(0)' }, { transform: `scaleX(${it.value / max})` }], { duration: 520, delay: 40 * i, easing: EASE_OUT, fill: 'backwards' });
    return h('div', { class: 'sb-share__row' },
      h('span', { class: 'sb-share__label' }, it.label),
      h('span', { class: 'sb-share__track' }, fill),
      h('span', { class: 'sb-share__value sb-num' }, it.display));
  }));
}
