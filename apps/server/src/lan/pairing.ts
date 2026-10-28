import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/** No 0/O or 1/I: easy to read on a terminal and to type on a phone. */
export const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIR_CODE_LENGTH = 8;
export const PAIR_CODE_TTL_MS = 10 * 60_000;

/** Old codes kept around only to answer "expired" instead of "wrong code". */
const RETIRED_KEEP = 8;
const RETIRED_TTL_MS = 60 * 60_000;

export function generatePairCode(): string {
  let code = '';
  for (let i = 0; i < PAIR_CODE_LENGTH; i++) code += PAIR_ALPHABET[randomInt(PAIR_ALPHABET.length)];
  return code;
}

/** Uppercase, without spaces or dashes ("k7m2-q9xa" -> "K7M2Q9XA"). */
export function normalizePairCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

const sha256 = (text: string) => createHash('sha256').update(text).digest();

/** Constant-time comparison (hashing first gives both sides the same length). */
export function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

export type PairCode = { code: string; expiresAt: number };

/** ok = paired; stale = a real code that expired or was already used; invalid = never existed. */
export type PairAttempt = 'ok' | 'stale' | 'invalid';

/** The one-time pairing code: valid for 10 minutes, single use, replaced after every pairing. */
export class PairingCodes {
  private active: PairCode;
  private readonly retired: { code: string; at: number }[] = [];

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = PAIR_CODE_TTL_MS,
  ) {
    this.active = { code: generatePairCode(), expiresAt: this.now() + this.ttlMs };
  }

  /** The code to show now (a fresh one when the last expired). */
  current(): PairCode {
    if (this.now() >= this.active.expiresAt) this.rotate();
    return { ...this.active };
  }

  /** Replaces the code: after a pairing, or when the user asks for a new one. */
  rotate(): PairCode {
    this.retired.push({ code: this.active.code, at: this.now() });
    if (this.retired.length > RETIRED_KEEP) this.retired.shift();
    this.active = { code: generatePairCode(), expiresAt: this.now() + this.ttlMs };
    return { ...this.active };
  }

  /** Checks a typed or scanned code. A valid code is used up at once. */
  consume(input: string): PairAttempt {
    const code = normalizePairCode(input);
    const t = this.now();
    if (sameSecret(code, this.active.code)) {
      const fresh = t < this.active.expiresAt;
      this.rotate();
      return fresh ? 'ok' : 'stale';
    }
    let stale = false;
    for (const old of this.retired) {
      if (t - old.at < RETIRED_TTL_MS && sameSecret(code, old.code)) stale = true;
    }
    return stale ? 'stale' : 'invalid';
  }
}

/** Failed attempts per key (the client IP) in a sliding window: 5 per minute by default. */
export class FailureLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max = 5,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Milliseconds until `key` may try again (0 = now). */
  retryAfterMs(key: string): number {
    const recent = this.recent(key);
    if (recent.length < this.max) return 0;
    const oldest = recent[recent.length - this.max] ?? this.now();
    return Math.max(1, oldest + this.windowMs - this.now());
  }

  fail(key: string): void {
    const recent = this.recent(key);
    recent.push(this.now());
    this.hits.set(key, recent.slice(-this.max));
    if (this.hits.size > 1000) this.prune();
  }

  private recent(key: string): number[] {
    const t = this.now();
    return (this.hits.get(key) ?? []).filter((at) => t - at < this.windowMs);
  }

  private prune(): void {
    for (const key of [...this.hits.keys()]) {
      if (this.recent(key).length === 0) this.hits.delete(key);
    }
  }
}
