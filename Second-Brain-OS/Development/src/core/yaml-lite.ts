/**
 * Minimal YAML emitter for frontmatter we create ourselves (scalars, arrays
 * of scalars, shallow objects). Existing frontmatter is always edited through
 * the host's `processFrontMatter`, never with this emitter.
 */

const NEEDS_QUOTE = /^$|^[\s\-?:,[\]{}#&*!|>'"%@`]|: |\s#|\s$|^(true|false|null|yes|no|on|off|~)$/i;

export function scalar(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (NEEDS_QUOTE.test(s) || /^[\d.+-]+$/.test(s) || s.includes('\n') || s.startsWith('[[')) return JSON.stringify(s);
  return s;
}

export function stringifyYaml(obj: Record<string, unknown>, indent = ''): string {
  let out = '';
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      if (!v.length) out += `${indent}${k}: []\n`;
      else out += `${indent}${k}:\n` + v.map((x) => `${indent}  - ${scalar(x)}\n`).join('');
    } else if (v && typeof v === 'object') {
      out += `${indent}${k}:\n` + stringifyYaml(v as Record<string, unknown>, indent + '  ');
    } else out += `${indent}${k}: ${scalar(v)}\n`;
  }
  return out;
}
