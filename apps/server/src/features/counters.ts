import type { Counter } from '@stream95/shared';

export const DEFAULT_COUNTERS: Counter[] = [
  { id: 'bugs', label: 'Bugs', value: 0 },
  { id: 'cafe', label: 'Cafés', value: 0 },
  { id: 'deploys', label: 'Deploys', value: 0 },
];

/** Small on-screen counters ("bugs esmagados", "cafés") changed from the dock or by mods in chat. */
export class CounterService {
  private counters: Counter[];

  constructor(
    initial: Counter[],
    private readonly publish: (counters: Counter[]) => void,
  ) {
    this.counters = initial.length ? initial.map((c) => ({ ...c })) : DEFAULT_COUNTERS.map((c) => ({ ...c }));
  }

  get all(): Counter[] {
    return this.counters.map((c) => ({ ...c }));
  }

  add(id: string, delta: number): Counter | null {
    const c = this.counters.find((x) => x.id === id);
    if (!c) return null;
    c.value = Math.max(0, c.value + Math.trunc(delta));
    this.publish(this.all);
    return { ...c };
  }

  set(id: string, value: number): Counter | null {
    const c = this.counters.find((x) => x.id === id);
    if (!c) return null;
    c.value = Math.max(0, Math.trunc(value));
    this.publish(this.all);
    return { ...c };
  }

  upsert(id: string, label: string): Counter {
    const clean = id
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20);
    if (!clean) throw new Error('id inválido');
    let c = this.counters.find((x) => x.id === clean);
    if (c) c.label = label.slice(0, 24);
    else {
      c = { id: clean, label: label.slice(0, 24), value: 0 };
      this.counters.push(c);
    }
    this.publish(this.all);
    return { ...c };
  }

  remove(id: string): void {
    this.counters = this.counters.filter((c) => c.id !== id);
    this.publish(this.all);
  }
}
