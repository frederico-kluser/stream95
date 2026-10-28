import type { ServiceState } from '@stream95/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../src/log.js';
import { ObsClient } from '../src/obs/obs.js';

type Handler = ((ev: { data?: unknown }) => void) | null;

/** Minimal WebSocket double: each test scripts what the "server" does. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  static script: (ws: FakeSocket) => void = () => {};
  readonly sent: string[] = [];
  readyState = 0;
  onmessage: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  closed = false;
  constructor(
    readonly url: string,
    readonly protocol: string,
  ) {
    FakeSocket.instances.push(this);
    queueMicrotask(() => FakeSocket.script(this));
  }
  send(data: string) {
    this.sent.push(data);
    const msg = JSON.parse(data) as { op: number };
    if (msg.op === 1) queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ op: 2, d: {} }) }));
    if (msg.op === 6) {
      const req = JSON.parse(data).d;
      queueMicrotask(() =>
        this.onmessage?.({
          data: JSON.stringify({
            op: 7,
            d: {
              requestId: req.requestId,
              requestType: req.requestType,
              requestStatus: { result: true },
              responseData: { currentProgramSceneName: 'Cena A', scenes: [{ sceneName: 'Cena A', sceneIndex: 0 }] },
            },
          }),
        }),
      );
    }
  }
  close() {
    this.closed = true;
  }
}

function client(states: ServiceState[]) {
  return new ObsClient(
    'ws://127.0.0.1:4455',
    undefined,
    { state: (s) => states.push(s), scenes: () => {} },
    silentLogger,
    { WebSocketImpl: FakeSocket as unknown as typeof WebSocket, retryMs: 20, handshakeMs: 50 },
  );
}

afterEach(() => {
  FakeSocket.instances = [];
  FakeSocket.script = () => {};
  vi.useRealTimers();
});

describe('ObsClient reconnection', () => {
  it('retries after an error that never becomes a close (Windows, OBS closed)', async () => {
    FakeSocket.script = (ws) => ws.onerror?.({});
    const states: ServiceState[] = [];
    const c = client(states);
    c.start();
    await new Promise((r) => setTimeout(r, 90));
    c.stop();
    expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(3);
    expect(states).toContain('off');
  });

  it('gives up on a silent server after the handshake timeout and tries again', async () => {
    FakeSocket.script = () => {}; // accepts but never says Hello
    const c = client([]);
    c.start();
    await new Promise((r) => setTimeout(r, 140));
    c.stop();
    expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(2);
    expect(FakeSocket.instances[0]?.closed).toBe(true);
  });

  it('goes online once OBS answers the handshake', async () => {
    FakeSocket.script = (ws) => {
      ws.readyState = 1; // OPEN
      ws.onmessage?.({ data: JSON.stringify({ op: 0, d: { rpcVersion: 1 } }) });
    };
    const states: ServiceState[] = [];
    const c = client(states);
    c.start();
    await new Promise((r) => setTimeout(r, 30));
    expect(states.at(-1)).toBe('online');
    expect(c.scene).toBe('Cena A');
    c.stop();
  });
});
