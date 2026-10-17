/**
 * Exponential backoff with full jitter (item 13): a random delay between 0
 * and min(cap, base × 2^attempt). Jitter stops retries from many failed jobs
 * landing on the provider at the same moment.
 */
export function backoffDelayMs(
  attempt: number,
  {
    baseMs = 30_000,
    capMs = 3_600_000,
    random = Math.random,
  }: { baseMs?: number; capMs?: number; random?: () => number } = {},
): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.round(random() * ceiling);
}
