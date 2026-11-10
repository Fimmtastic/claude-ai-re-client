/** Developer logger. Debug output only when enabled in settings. */
type Level = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  debugEnabled = false;
  private ring: { ts: number; level: Level; msg: string }[] = [];

  private push(level: Level, msg: string, args: unknown[]) {
    this.ring.push({ ts: Date.now(), level, msg: [msg, ...args.map((a) => (a instanceof Error ? a.message : safe(a)))].join(' ') });
    if (this.ring.length > 300) this.ring.shift();
  }
  debug(msg: string, ...args: unknown[]) {
    this.push('debug', msg, args);
    if (this.debugEnabled) console.debug(`[SBOS] ${msg}`, ...args);
  }
  info(msg: string, ...args: unknown[]) {
    this.push('info', msg, args);
    if (this.debugEnabled) console.info(`[SBOS] ${msg}`, ...args);
  }
  warn(msg: string, ...args: unknown[]) {
    this.push('warn', msg, args);
    console.warn(`[SBOS] ${msg}`, ...args);
  }
  error(msg: string, ...args: unknown[]) {
    this.push('error', msg, args);
    console.error(`[SBOS] ${msg}`, ...args);
  }
  /** Measures a sync or async block and logs duration in debug mode. */
  async time<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      this.debug(`${label}: ${(performance.now() - t0).toFixed(1)}ms`);
    }
  }
  history() {
    return [...this.ring];
  }
}

function safe(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const log = new Logger();
