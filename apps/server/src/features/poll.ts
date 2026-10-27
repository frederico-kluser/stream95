import { randomUUID } from 'node:crypto';
import type { PollState } from '@stream95/shared';

/** Chat poll: viewers vote with !1, !2, ... — one vote per user (last vote counts). */
export class PollService {
  private poll: PollState | null = null;
  private readonly votes = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly publish: (poll: PollState | null) => void) {}

  get current(): PollState | null {
    return this.poll;
  }

  start(question: string, options: string[], durationSec = 0): PollState {
    const clean = options
      .map((o) => o.trim())
      .filter(Boolean)
      .slice(0, 9);
    if (!question.trim()) throw new Error('enquete sem pergunta');
    if (clean.length < 2) throw new Error('enquete precisa de pelo menos 2 opções');
    this.clearTimer();
    this.votes.clear();
    const now = Date.now();
    this.poll = {
      id: randomUUID(),
      question: question.trim().slice(0, 120),
      options: clean.map((label) => ({ label: label.slice(0, 60), votes: 0 })),
      open: true,
      createdAt: now,
      totalVotes: 0,
      ...(durationSec > 0 ? { endsAt: now + durationSec * 1000 } : {}),
    };
    if (durationSec > 0) this.timer = setTimeout(() => this.close(), durationSec * 1000);
    this.publish(this.poll);
    return this.poll;
  }

  /** Returns true when the vote counted. */
  vote(user: string, optionNumber: number): boolean {
    const poll = this.poll;
    if (!poll?.open) return false;
    const idx = optionNumber - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= poll.options.length) return false;
    const key = user.toLowerCase();
    const previous = this.votes.get(key);
    if (previous === idx) return false;
    if (previous !== undefined) poll.options[previous]!.votes--;
    poll.options[idx]!.votes++;
    this.votes.set(key, idx);
    poll.totalVotes = this.votes.size;
    this.publish(poll);
    return true;
  }

  close(): PollState | null {
    this.clearTimer();
    if (!this.poll) return null;
    this.poll.open = false;
    this.publish(this.poll);
    return this.poll;
  }

  dismiss(): void {
    this.clearTimer();
    this.poll = null;
    this.votes.clear();
    this.publish(null);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
