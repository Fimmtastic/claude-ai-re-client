import type { EntityKind, ISODate, Priority, ReviewPeriod, WorkContext } from './types';
import { stringifyYaml } from './yaml-lite';

/**
 * File templates. Content is plain Markdown + YAML so it remains readable
 * without the plugin. Users can override templates by placing
 * `00-System/Templates/<kind>.md` (variables: {{title}} {{date}} {{id}}).
 */

export interface CreateInput {
  kind: EntityKind;
  title: string;
  date: ISODate;
  id: string;
  project?: string; // basename
  goal?: string; // basename
  priority?: Priority;
  status?: string;
  area?: string;
  level?: string;
  parent?: string;
  due?: ISODate;
  minutes?: number;
  technologies?: string[];
  context?: WorkContext;
  topic?: string;
  period?: ReviewPeriod;
  periodKey?: string;
  description?: string;
  body?: string;
  /** worklog / journal section contents (multi-line; lines become bullets for list sections) */
  sections?: Partial<Record<'activity' | 'learned' | 'problems' | 'solutions' | 'questions' | 'next' | 'thoughts' | 'highlights' | 'insights' | 'focus', string>>;
  extra?: Record<string, unknown>;
}

export function frontmatter(fields: Record<string, unknown>): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0 && k !== 'tags')) clean[k] = v;
  return `---\n${stringifyYaml(clean)}---\n`;
}

const link = (b?: string) => (b ? `[[${b}]]` : undefined);

export function renderTemplate(i: CreateInput): string {
  const common = { id: i.id, type: i.kind, created: i.date };
  switch (i.kind) {
    case 'project':
      return (
        frontmatter({
          ...common,
          status: i.status ?? 'active',
          priority: i.priority ?? 'medium',
          area: i.area,
          start: i.date,
          deadline: i.due,
          goals: i.goal ? [link(i.goal)] : [],
          description: i.description,
          ...i.extra,
        }) +
        `\n# ${i.title}\n\n${i.description ? i.description + '\n\n' : ''}## Milestones\n\n## Tasks\n\n## Notes\n\n## Resources\n`
      );
    case 'goal':
      return (
        frontmatter({ ...common, level: i.level ?? 'quarter', status: 'active', area: i.area, parent: link(i.parent), due: i.due, description: i.description, ...i.extra }) +
        `\n# ${i.title}\n\n## Why\n\n## Milestones\n\n## Next actions\n`
      );
    case 'worklog':
      return (
        frontmatter({
          ...common,
          date: i.date,
          project: link(i.project),
          duration: i.minutes !== undefined ? `${Math.floor(i.minutes / 60)}h${i.minutes % 60 ? ' ' + (i.minutes % 60) + 'm' : ''}` : undefined,
          technologies: i.technologies ?? [],
          context: i.context ?? 'work',
          ...i.extra,
        }) +
        `\n# ${i.title}\n\n## Tätigkeit\n${i.sections?.activity ?? i.body ?? ''}\n\n## Gelernt\n${bullets(i.sections?.learned)}\n\n## Probleme\n${bullets(i.sections?.problems)}\n\n## Lösungen\n${bullets(i.sections?.solutions)}\n\n## Offene Fragen\n${bullets(i.sections?.questions)}\n\n## Nächste Schritte\n${bullets(i.sections?.next)}\n`
      );
    case 'journal':
      return frontmatter({ ...common, date: i.date, mood: undefined, ...i.extra }) + `\n# ${i.title}\n\n## Gedanken\n${i.sections?.thoughts ?? i.body ?? ''}\n\n## Highlights\n${bullets(i.sections?.highlights)}\n\n## Erkenntnisse\n${bullets(i.sections?.insights)}\n\n## Nächster Fokus\n${bullets(i.sections?.focus)}\n`;
    case 'daily':
      return frontmatter({ ...common, date: i.date, focus: '', habits: [], ...i.extra }) + `\n# ${i.title}\n\n## Plan\n\n## Notes\n`;
    case 'review':
      return frontmatter({ ...common, date: i.date, period: i.period ?? 'weekly', periodKey: i.periodKey, ...i.extra }) + `\n# ${i.title}\n\n${i.body ?? ''}\n`;
    case 'learning':
      return (
        frontmatter({ ...common, status: 'active', area: i.area ?? 'Knowledge', progress: 0, total: undefined, unit: undefined, ...i.extra }) +
        `\n# ${i.title}\n\n## Ziel\n\n## Sessions\n<!-- Format: - YYYY-MM-DD · 45min · Thema -->\n\n## Notizen\n`
      );
    case 'resource':
      return frontmatter({ ...common, topic: i.topic, url: undefined, project: link(i.project), tags: [], ...i.extra }) + `\n# ${i.title}\n\n${i.body ?? ''}\n`;
    case 'note':
    default:
      return frontmatter({ ...common, topic: i.topic, tags: [], ...i.extra }) + `\n# ${i.title}\n\n${i.body ?? ''}\n`;
  }
}

export function applyUserTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
}

export function safeFilename(title: string): string {
  return title
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Untitled';
}

/** "a\nb" → "- a\n- b"; empty → "- " placeholder */
export function bullets(text?: string): string {
  const items = (text ?? '').split('\n').map((l) => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
  return items.length ? items.map((l) => `- ${l}`).join('\n') : '- ';
}
