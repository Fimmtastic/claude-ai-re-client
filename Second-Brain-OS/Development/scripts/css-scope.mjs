// Build-time CSS hardening.
//
// Obsidian styles bare elements globally, e.g. `button:not(.clickable-icon)`
// (specificity 0,1,1) and `button:not(.clickable-icon):hover` (0,2,1). Those beat
// plain component classes like `.sb-theme-swatch` (0,1,0) and silently break the
// UI (grey pill buttons, fixed heights, collapsed previews).
//
// We raise every app selector to start with `.sbos-root.sbos-root` (0,2,0 + …),
// which beats Obsidian's element rules, while a neutral reset for raw elements
// (`.sbos-root button` 0,1,1 / `:hover` 0,2,1) sits in between: it overrides
// Obsidian but loses to every component rule.

const BOOST = '.sbos-root.sbos-root';

function splitTopLevel(sel) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function boostSelector(s) {
  const t = s.trim();
  if (!t) return s;
  if (t.startsWith('.sbos-root')) return BOOST + t.slice('.sbos-root'.length);
  if (/^\.(sb-app|sb-overlay-layer)\b/.test(t)) return BOOST + t; // the root element itself
  if (/^\.(sb-|span-\d|is-private)/.test(t)) return `${BOOST} ${t}`;
  return t; // body…, .workspace…, element selectors, :where(…) resets: untouched
}

/** Transforms a stylesheet; recurses into @media/@container/@supports, keeps @keyframes/@font-face verbatim. */
export function scopeCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) {
      out += css.slice(i);
      break;
    }
    const prelude = css.slice(i, open);
    // find matching close brace
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    const p = prelude.trim();
    if (p.startsWith('@')) {
      if (/^@(media|container|supports|layer)\b/.test(p)) out += `${p}{${scopeCss(body)}}\n`;
      else out += `${p}{${body}}\n`;
    } else {
      out += `${splitTopLevel(p).map(boostSelector).join(',')}{${body}}\n`;
    }
    i = j;
  }
  return out;
}
