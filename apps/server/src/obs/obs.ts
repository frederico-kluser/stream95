import { createHash, randomUUID } from 'node:crypto';
import type { ServiceState } from '@stream95/shared';
import type { Logger } from '../log.js';

/** obs-websocket v5 authentication string: base64(sha256(base64(sha256(password + salt)) + challenge)). */
export function obsAuth(password: string, salt: string, challenge: string): string {
  const secret = createHash('sha256')
    .update(password + salt)
    .digest('base64');
  return createHash('sha256')
    .update(secret + challenge)
    .digest('base64');
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

const OP = { Hello: 0, Identify: 1, Identified: 2, Event: 5, Request: 6, RequestResponse: 7 } as const;
const EVENT_SUB_SCENES = 1 << 2;

export type ObsHandlers = {
  state: (s: ServiceState) => void;
  scenes: (current: string | null, all: string[]) => void;
};

/** Tiny obs-websocket v5 client: list scenes, switch scene, follow scene changes. Reconnects quietly. */
export class ObsClient {
  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private retry: NodeJS.Timeout | null = null;
  private enabled = false;
  private current: string | null = null;
  private all: string[] = [];

  constructor(
    private readonly url: string,
    private readonly password: string | undefined,
    private readonly handlers: ObsHandlers,
    private readonly log: Logger,
  ) {}

  get scene(): string | null {
    return this.current;
  }

  get scenes(): string[] {
    return [...this.all];
  }

  start(): void {
    this.enabled = true;
    this.connect();
  }

  stop(): void {
    this.enabled = false;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.ws?.close();
    this.ws = null;
    this.handlers.state('off');
  }

  async setScene(name: string): Promise<void> {
    await this.request('SetCurrentProgramScene', { sceneName: name });
  }

  async refreshScenes(): Promise<void> {
    const data = (await this.request('GetSceneList')) as {
      currentProgramSceneName?: string;
      scenes?: { sceneName: string; sceneIndex: number }[];
    };
    // OBS lists scenes bottom-up; show them in the same order as the OBS UI.
    this.all = (data.scenes ?? []).sort((a, b) => b.sceneIndex - a.sceneIndex).map((s) => s.sceneName);
    this.current = data.currentProgramSceneName ?? null;
    this.handlers.scenes(this.current, this.all);
  }

  request(requestType: string, requestData?: Record<string, unknown>, timeoutMs = 5000): Promise<unknown> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('OBS desconectado'));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`OBS não respondeu ${requestType}`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      ws.send(
        JSON.stringify({ op: OP.Request, d: { requestType, requestId, ...(requestData ? { requestData } : {}) } }),
      );
    });
  }

  private connect(): void {
    if (!this.enabled) return;
    this.handlers.state('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url, 'obswebsocket.json');
    } catch (err) {
      this.log.debug({ err }, 'obs connect failed');
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onmessage = (ev) => this.onFrame(ws, String(ev.data));
    ws.onclose = () => {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error('OBS desconectado'));
        this.pending.delete(id);
      }
      if (this.ws === ws) {
        this.ws = null;
        this.scheduleRetry();
      }
    };
    ws.onerror = () => {
      /* onclose handles the retry */
    };
  }

  private onFrame(ws: WebSocket, raw: string): void {
    // biome-ignore lint/suspicious/noExplicitAny: protocol frames are validated by op code
    let msg: { op: number; d: any };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.op === OP.Hello) {
      const auth = msg.d?.authentication;
      if (auth && !this.password) {
        this.log.warn({}, 'OBS pede senha: defina OBS_WS_PASSWORD no .env');
        this.handlers.state('error');
        this.enabled = false;
        ws.close();
        return;
      }
      ws.send(
        JSON.stringify({
          op: OP.Identify,
          d: {
            rpcVersion: 1,
            eventSubscriptions: EVENT_SUB_SCENES,
            ...(auth ? { authentication: obsAuth(this.password!, auth.salt, auth.challenge) } : {}),
          },
        }),
      );
    } else if (msg.op === OP.Identified) {
      this.handlers.state('online');
      void this.refreshScenes().catch((err) => this.log.warn({ err: (err as Error).message }, 'obs scene list failed'));
    } else if (msg.op === OP.RequestResponse) {
      const p = this.pending.get(msg.d?.requestId);
      if (!p) return;
      this.pending.delete(msg.d.requestId);
      clearTimeout(p.timer);
      if (msg.d?.requestStatus?.result) p.resolve(msg.d.responseData ?? {});
      else p.reject(new Error(msg.d?.requestStatus?.comment ?? `OBS recusou ${msg.d?.requestType}`));
    } else if (msg.op === OP.Event) {
      const type = msg.d?.eventType;
      if (type === 'CurrentProgramSceneChanged') {
        this.current = msg.d?.eventData?.sceneName ?? null;
        this.handlers.scenes(this.current, this.all);
      } else if (
        type === 'SceneListChanged' ||
        type === 'SceneNameChanged' ||
        type === 'SceneCreated' ||
        type === 'SceneRemoved'
      ) {
        void this.refreshScenes().catch(() => {});
      }
    }
  }

  private scheduleRetry(): void {
    if (!this.enabled || this.retry) return;
    // OBS closed or WebSocket server disabled: show "off" and keep trying quietly.
    this.handlers.state('off');
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, 10_000);
  }
}
