/** Boots the real plugin entry (src/main.ts) against tests/e2e/obsidian-mock.ts. */
import Plugin from '../../src/main';
import { App, Notice } from 'obsidian';

declare const __SEED__: Record<string, { content: string }>;
const w = window as unknown as Record<string, unknown>;
document.body.classList.add('theme-dark');
(async () => {
  const app = new App() as unknown as InstanceType<typeof App> & { vault: { create(p: string, c: string): Promise<unknown> } };
  for (const [p, f] of Object.entries(__SEED__)) await app.vault.create(p, f.content);
  const plugin = new (Plugin as unknown as new (a: unknown, m: unknown) => Plugin)(app, { id: 'second-brain-core' });
  await plugin.onload();
  w.__plugin = plugin;
  w.__app = app;
  w.__notice = Notice;
  w.__pluginReady = true;
})().catch((e) => { w.__pluginError = String(e?.stack ?? e); });
