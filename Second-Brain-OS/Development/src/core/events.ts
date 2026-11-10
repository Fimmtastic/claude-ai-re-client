/** Minimal typed event emitter. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<(p: never) => void>>();

  on<K extends keyof Events>(name: K, fn: (payload: Events[K]) => void): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => set!.delete(fn as (p: never) => void);
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as (p: Events[K]) => void)(payload);
      } catch (e) {
        console.error('[SBOS] event handler failed', name, e);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
