import {
  AUDIO_EVENTS,
  type ClientEvent,
  type ClientRole,
  DOCK_ONLY_EVENTS,
  type ServerEvent,
  type Settings,
  type Snapshot,
} from '@stream95/shared';
import type { Logger } from './log.js';

/** The subset of a WebSocket we need (lets tests use a fake socket). */
export type HubSocket = {
  readonly readyState: number;
  send: (data: string) => void;
  on: (event: 'message' | 'close' | 'error', listener: (...args: never[]) => void) => unknown;
};

type Client = { socket: HubSocket; role: ClientRole };

const OPEN = 1;

/** Fan-out of server events to every connected overlay, audio player and dock. */
export class Hub {
  private readonly clients = new Set<Client>();
  private readonly listeners = new Set<(event: ClientEvent, role: ClientRole) => void>();

  constructor(
    private readonly snapshot: () => Snapshot,
    private readonly settings: () => Settings,
    private readonly log: Logger,
  ) {}

  get size(): number {
    return this.clients.size;
  }

  countByRole(): Record<ClientRole, number> {
    const counts: Record<ClientRole, number> = { overlay: 0, dock: 0, audio: 0 };
    for (const c of this.clients) counts[c.role]++;
    return counts;
  }

  add(socket: HubSocket, role: ClientRole): void {
    const client: Client = { socket, role };
    this.clients.add(client);
    socket.on('close', () => this.clients.delete(client));
    socket.on('error', () => this.clients.delete(client));
    socket.on('message', ((raw: Buffer | string) => {
      try {
        const event = JSON.parse(raw.toString()) as ClientEvent;
        for (const l of this.listeners) l(event, role);
      } catch {
        // ignore garbage from clients
      }
    }) as never);
    this.sendTo(client, { type: 'hello', role, settings: this.settings(), snapshot: this.snapshot() });
  }

  onClientEvent(listener: (event: ClientEvent, role: ClientRole) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  broadcast(event: ServerEvent): void {
    const dockOnly = DOCK_ONLY_EVENTS.has(event.type);
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (dockOnly && client.role !== 'dock') continue;
      if (client.role === 'audio' && !AUDIO_EVENTS.has(event.type)) continue;
      this.write(client, payload);
    }
  }

  private sendTo(client: Client, event: ServerEvent): void {
    this.write(client, JSON.stringify(event));
  }

  private write(client: Client, payload: string): void {
    if (client.socket.readyState !== OPEN) return;
    try {
      client.socket.send(payload);
    } catch (err) {
      this.log.warn({ err }, 'ws send failed');
      this.clients.delete(client);
    }
  }
}
