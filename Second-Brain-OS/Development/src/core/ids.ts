/** ID generation. IDs are short, sortable-ish, human-safe and collision-checked. */

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford-ish, no i l o u

export function randomSuffix(len = 6, rnd: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
  return s;
}

export const ID_PREFIX: Record<string, string> = {
  note: 'nt',
  project: 'pr',
  goal: 'gl',
  worklog: 'wl',
  journal: 'jn',
  daily: 'dy',
  review: 'rv',
  learning: 'ln',
  resource: 'rs',
  task: 't',
};

/** Creates a new id that does not exist in `taken`. */
export function newId(kind: string, taken: (id: string) => boolean, rnd: () => number = Math.random): string {
  const prefix = ID_PREFIX[kind] ?? 'x';
  for (let i = 0; i < 50; i++) {
    const id = `${prefix}-${randomSuffix(kind === 'task' ? 6 : 8, rnd)}`;
    if (!taken(id)) return id;
  }
  throw new Error(`Could not allocate unique id for ${kind}`);
}

/** Deterministic fallback id for files lacking an `id` field (not persisted). */
export function pathId(path: string): string {
  let h = 2166136261;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `path-${(h >>> 0).toString(36)}`;
}

export const BLOCK_ID_RE = /\s\^(t-[0-9a-z]{4,12})\s*$/;
