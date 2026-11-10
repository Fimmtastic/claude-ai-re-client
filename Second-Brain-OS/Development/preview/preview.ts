/**
 * Browser preview harness — runs the real AppShell, store and actions on an
 * in-memory vault seeded with the demo vault's Markdown files. Used for
 * visual QA and Playwright end-to-end tests outside Obsidian.
 */
import { MemoryPort } from '../src/services/memory-port';
import { DataStore } from '../src/core/store';
import { Actions } from '../src/core/actions';
import { mergeSettings } from '../src/core/settings';
import { AppShell } from '../src/views/shell';

declare const __SEED__: Record<string, { content: string; mtime: number; ctime: number }>;

const params = new URLSearchParams(location.search);
const theme = params.get('theme') ?? 'dark';
document.body.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
if (params.get('motion') === 'reduce') document.body.classList.add('sb-reduce-motion');
if (params.get('mobile')) document.body.classList.add('is-mobile', 'is-phone');

const port = new MemoryPort(__SEED__);
const store = new DataStore(port);
const settings = mergeSettings({ userName: 'Alex', motto: params.get('motto') ?? '', ui: { route: params.get('route') ?? 'home' } });
const actions = new Actions(port, store, () => settings);
const w = window as unknown as Record<string, unknown>;
w.__sbos = { port, store, actions, settings };

void store.init().then(() => {
  const shell = new AppShell({ store, actions, port, host: 'preview', settings, saveSettings: () => {} });
  shell.mount(document.getElementById('app')!);
  w.__sbos = { port, store, actions, settings, shell };
  w.__sbosReady = true;
});
