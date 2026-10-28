import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PairedDevice } from '@stream95/shared';
import { z } from 'zod';
import type { Logger } from '../log.js';
import { JsonStore } from '../store.js';

/** File (inside the server data folder) with the paired devices. */
export const DEVICES_FILE = 'devices.json';
export const MAX_DEVICES = 50;
/** lastSeenAt is refreshed at most this often (each refresh is a disk write). */
export const LAST_SEEN_EVERY_MS = 60_000;

const DeviceRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.number(),
  lastSeenAt: z.number().nullable(),
});

type DeviceRecord = z.infer<typeof DeviceRecordSchema>;

export type DevicesFile = { version: 1; devices: DeviceRecord[] };

// randomBytes(32) in base64url is 43 chars; anything far off is not one of ours
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,200}$/;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const toPublic = ({ id, name, createdAt, lastSeenAt }: DeviceRecord): PairedDevice => ({
  id,
  name,
  createdAt,
  lastSeenAt,
});

/** Device name for lists and logs ("iPhone · Safari"): one line, at most 40 characters. */
export function cleanDeviceName(name: string | undefined): string {
  const flat = (name ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(flat).slice(0, 40).join('').trim() || 'Aparelho';
}

/**
 * Phones and tablets allowed to use the deck over the local network. Tokens are shown once at
 * pairing; only their sha256 is stored (in `<dataDir>/devices.json`).
 */
export class DeviceRegistry {
  private writing: Promise<void> = Promise.resolve();

  private constructor(
    private readonly store: JsonStore<DevicesFile>,
    private devices: DeviceRecord[],
    private readonly log: Logger,
    private readonly now: () => number,
  ) {}

  static async load(file: string, log: Logger, now: () => number = Date.now): Promise<DeviceRegistry> {
    const store = new JsonStore<DevicesFile>(file);
    const raw: unknown = await store.read({ version: 1, devices: [] });
    const list = (raw as { devices?: unknown } | null)?.devices;
    const entries: unknown[] = Array.isArray(list) ? list : [];
    const devices: DeviceRecord[] = [];
    for (const entry of entries) {
      const parsed = DeviceRecordSchema.safeParse(entry);
      if (parsed.success) devices.push(parsed.data);
    }
    if (devices.length !== entries.length) log.warn({ file }, 'devices.json: ignored invalid entries');
    return new DeviceRegistry(store, devices, log, now);
  }

  get size(): number {
    return this.devices.length;
  }

  list(): PairedDevice[] {
    return this.devices.map(toPublic);
  }

  has(id: string): boolean {
    return this.devices.some((d) => d.id === id);
  }

  /** Registers a device. The token is returned once and never stored. Null when the list is full. */
  async add(name: string | undefined): Promise<{ token: string; device: PairedDevice } | null> {
    if (this.devices.length >= MAX_DEVICES) return null;
    const token = randomBytes(32).toString('base64url');
    const t = this.now();
    const record: DeviceRecord = {
      id: randomUUID(),
      name: cleanDeviceName(name),
      tokenHash: hashToken(token),
      createdAt: t,
      lastSeenAt: t,
    };
    this.devices.push(record);
    await this.persist();
    return { token, device: toPublic(record) };
  }

  /** The device that owns `token`, or null. Also refreshes lastSeenAt (at most once a minute). */
  verify(token: string | null | undefined): PairedDevice | null {
    if (!token || !TOKEN_FORMAT.test(token)) return null;
    const hash = Buffer.from(hashToken(token), 'hex');
    let match: DeviceRecord | null = null;
    for (const device of this.devices) {
      // compare against every device so the timing does not depend on the position
      const same = timingSafeEqual(hash, Buffer.from(device.tokenHash, 'hex'));
      if (same && !match) match = device;
    }
    if (!match) return null;
    const t = this.now();
    if (match.lastSeenAt === null || t - match.lastSeenAt >= LAST_SEEN_EVERY_MS) {
      match.lastSeenAt = t;
      void this.persist();
    }
    return toPublic(match);
  }

  /** Forgets a device: its token stops working at once. */
  async revoke(id: string): Promise<boolean> {
    const before = this.devices.length;
    this.devices = this.devices.filter((d) => d.id !== id);
    if (this.devices.length === before) return false;
    await this.persist();
    return true;
  }

  /** Resolves when every pending write reached the disk. */
  flush(): Promise<void> {
    return this.writing;
  }

  // Writes run one after another (JsonStore uses a single temp file per process).
  private persist(): Promise<void> {
    const data: DevicesFile = { version: 1, devices: this.devices.map((d) => ({ ...d })) };
    this.writing = this.writing
      .then(() => this.store.writeNow(data))
      .catch((err) => this.log.warn({ err: (err as Error).message }, 'devices.json: save failed'));
    return this.writing;
  }
}
