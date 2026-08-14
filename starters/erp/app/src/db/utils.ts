/** Stable random id for new rows. UUID keeps migration history intact. */
export function createId(): string {
  return crypto.randomUUID();
}
