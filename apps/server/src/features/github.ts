import type { GithubEvent, ServiceState } from '@stream95/shared';
import type { Logger } from '../log.js';

// biome-ignore lint/suspicious/noExplicitAny: GitHub events API payloads are large and loosely typed
type RawEvent = any;

/** Map a raw GitHub public event into something worth a toast on stream. */
export function toGithubEvent(raw: RawEvent): GithubEvent | null {
  const repo = String(raw?.repo?.name ?? '');
  const createdAt = Date.parse(raw?.created_at ?? '') || Date.now();
  const base = { id: String(raw?.id ?? ''), repo, createdAt };
  const repoUrl = `https://github.com/${repo}`;
  switch (raw?.type) {
    case 'PushEvent': {
      // Since 2025 the public events API omits `commits` (only before/head/ref): fall back to branch + sha.
      const commits: RawEvent[] = raw.payload?.commits ?? [];
      const last = commits[commits.length - 1];
      const msg = String(last?.message ?? '').split('\n')[0] ?? '';
      const n = raw.payload?.size ?? commits.length;
      const branch = String(raw.payload?.ref ?? '').replace('refs/heads/', '');
      const sha = String(raw.payload?.head ?? '').slice(0, 7);
      return {
        ...base,
        type: 'push',
        title: msg ? `${msg}${n > 1 ? ` (+${n - 1})` : ''}` : `push em ${branch || 'main'}${sha ? ` (${sha})` : ''}`,
        url: repoUrl,
      };
    }
    case 'PullRequestEvent': {
      // The slim payload has no title and uses the action "merged"; older payloads use closed + merged.
      const pr = raw.payload?.pull_request;
      const action = pr?.merged || raw.payload?.action === 'merged' ? 'merged' : raw.payload?.action;
      const number = raw.payload?.number ?? pr?.number;
      return {
        ...base,
        type: 'pull_request',
        title: pr?.title ? `PR ${action}: ${pr.title}` : `PR #${number ?? '?'} ${action}`,
        url: pr?.html_url ?? `${repoUrl}/pull/${number ?? ''}`,
      };
    }
    case 'ReleaseEvent':
      return {
        ...base,
        type: 'release',
        title: `release ${raw.payload?.release?.tag_name ?? ''}`,
        url: raw.payload?.release?.html_url ?? repoUrl,
      };
    case 'CreateEvent':
      if (raw.payload?.ref_type === 'repository')
        return { ...base, type: 'create', title: 'novo repositório', url: repoUrl };
      if (raw.payload?.ref_type === 'tag')
        return { ...base, type: 'create', title: `nova tag ${raw.payload?.ref ?? ''}`, url: repoUrl };
      return null;
    case 'WatchEvent':
      return { ...base, type: 'star', title: `${raw.actor?.login ?? 'alguém'} deu estrela`, url: repoUrl };
    case 'ForkEvent':
      return { ...base, type: 'fork', title: 'fork', url: repoUrl };
    case 'IssuesEvent':
      return {
        ...base,
        type: 'issue',
        title: `issue ${raw.payload?.action}: ${raw.payload?.issue?.title ?? ''}`,
        url: raw.payload?.issue?.html_url ?? repoUrl,
      };
    default:
      return null;
  }
}

/**
 * Polls the public events of a GitHub user and publishes only NEW events.
 * Uses ETag (304s are cheap) and honours X-Poll-Interval.
 */
export class GithubFeed {
  private etag: string | null = null;
  private seen = new Set<string>();
  private primed = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly recentEvents: GithubEvent[] = [];
  private readonly titles = new Map<string, string>();
  state: ServiceState = 'off';

  constructor(
    private readonly options: () => { enabled: boolean; user: string; pollSec: number },
    private readonly token: string | undefined,
    private readonly publish: (event: GithubEvent) => void,
    private readonly onState: (s: ServiceState) => void,
    private readonly log: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get recent(): GithubEvent[] {
    return [...this.recentEvents];
  }

  start(): void {
    this.stop();
    if (!this.options().enabled || !this.options().user) {
      this.setState('off');
      return;
    }
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    const { user, pollSec } = this.options();
    let wait = pollSec;
    try {
      const res = await this.fetchImpl(
        `https://api.github.com/users/${encodeURIComponent(user)}/events/public?per_page=30`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'stream95',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(this.etag ? { 'If-None-Match': this.etag } : {}),
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
        },
      );
      const interval = Number(res.headers.get('x-poll-interval'));
      if (Number.isFinite(interval) && interval > wait) wait = interval;
      if (res.status === 304) {
        this.setState('online');
      } else if (res.ok) {
        this.etag = res.headers.get('etag');
        const events = ((await res.json()) as RawEvent[]).slice().reverse();
        for (const raw of events) {
          const id = String(raw?.id ?? '');
          if (!id || this.seen.has(id)) continue;
          this.seen.add(id);
          const ev = toGithubEvent(raw);
          if (!ev) continue;
          if (this.primed || raw === events[events.length - 1]) await this.enrich(raw, ev);
          this.recentEvents.push(ev);
          if (this.recentEvents.length > 20) this.recentEvents.shift();
          // The first fetch only primes history: no toast storm when the server boots.
          if (this.primed) this.publish(ev);
        }
        this.primed = true;
        if (this.seen.size > 2000) this.seen = new Set([...this.seen].slice(-500));
        this.setState('online');
      } else {
        this.log.warn({ status: res.status }, 'github feed error');
        this.setState('error');
        if (res.status === 403 || res.status === 429) wait = Math.max(wait, 600);
      }
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'github feed failed');
      this.setState('error');
    }
    this.timer = setTimeout(() => void this.tick(), wait * 1000);
  }

  /** The slim events API lacks commit messages and PR titles: fetch them (cached) for events we show. */
  private async enrich(raw: RawEvent, ev: GithubEvent): Promise<void> {
    try {
      let url: string | null = null;
      if (raw?.type === 'PushEvent' && !raw.payload?.commits?.length && raw.payload?.head) {
        url = `https://api.github.com/repos/${raw.repo?.name}/commits/${raw.payload.head}`;
      } else if (
        raw?.type === 'PullRequestEvent' &&
        !raw.payload?.pull_request?.title &&
        raw.payload?.pull_request?.url
      ) {
        url = String(raw.payload.pull_request.url);
      }
      if (!url?.startsWith('https://api.github.com/')) return;
      const cached = this.titles.get(url);
      const title = cached ?? (await this.fetchTitle(url));
      if (!title) return;
      this.titles.set(url, title);
      if (this.titles.size > 300) this.titles.delete(this.titles.keys().next().value as string);
      ev.title =
        raw.type === 'PushEvent' ? title : `PR ${ev.title.split(' ').slice(2).join(' ') || 'atualizado'}: ${title}`;
    } catch {
      // keep the fallback title
    }
  }

  private async fetchTitle(url: string): Promise<string | null> {
    const res = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'stream95',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    });
    if (!res.ok) return null;
    // biome-ignore lint/suspicious/noExplicitAny: commit or pull request JSON
    const data: any = await res.json();
    const text = String(data?.commit?.message ?? data?.title ?? '')
      .split('\n')[0]
      ?.trim();
    return text || null;
  }

  private setState(s: ServiceState): void {
    if (this.state !== s) {
      this.state = s;
      this.onState(s);
    }
  }
}
