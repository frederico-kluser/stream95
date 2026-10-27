import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Atomic JSON file persistence (write to a temp file, then rename). */
export class JsonStore<T> {
  private timer: NodeJS.Timeout | null = null;
  private pending: T | null = null;

  constructor(
    private readonly file: string,
    private readonly debounceMs = 250,
  ) {}

  async read(fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  /** Debounced save; the latest value wins. */
  save(value: T): void {
    this.pending = value;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const v = this.pending;
      this.pending = null;
      if (v !== null) void this.writeNow(v);
    }, this.debounceMs);
  }

  async writeNow(value: T): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(tmp, this.file);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending !== null) {
      const v = this.pending;
      this.pending = null;
      await this.writeNow(v);
    }
  }
}

/** Append-only JSON Lines log (moderation audit trail). */
export async function appendJsonLine(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(value)}\n`, 'utf8');
}
