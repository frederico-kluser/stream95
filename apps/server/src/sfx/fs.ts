import { rename, rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

// On Windows a file stays locked for a moment while ffmpeg, an antivirus or the indexer reads it.
const TRANSIENT = new Set(['EBUSY', 'EPERM', 'EACCES']);
const ATTEMPTS = 5;

async function withRetry(op: () => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await op();
      return;
    } catch (err) {
      if (attempt >= ATTEMPTS || !TRANSIENT.has((err as NodeJS.ErrnoException).code ?? '')) throw err;
      await sleep(60 * attempt);
    }
  }
}

export const renameWithRetry = (from: string, to: string): Promise<void> => withRetry(() => rename(from, to));

/** Deletes a file (never a folder); a missing file is fine. */
export const removeFileWithRetry = (file: string): Promise<void> => withRetry(() => rm(file, { force: true }));
