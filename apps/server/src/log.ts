/** Minimal logger contract (Fastify's pino logger satisfies it). */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {}, debug() {} };
