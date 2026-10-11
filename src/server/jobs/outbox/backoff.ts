const MINUTE = 60_000;
const MAX_DELAY_MS = 4 * 60 * MINUTE;

/**
 * Delay before the next attempt of an outbox event, by the number of attempts
 * already made: 1, 2, 4 … minutes, at most 4 hours. With 10 attempts an event
 * is retried for about 8 hours before it is FAILED: enough for a mail
 * provider's outage to pass.
 */
export function retryDelayMs(attempt: number): number {
  return Math.min(MINUTE * 2 ** (attempt - 1), MAX_DELAY_MS);
}
