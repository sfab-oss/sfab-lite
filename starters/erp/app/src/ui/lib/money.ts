const FORMAT = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
});

const NON_NUMERIC = /[^0-9.]/g;

/** Money is stored in minor units; this is the only place it becomes a string. */
export function formatCents(cents: number): string {
  return FORMAT.format(cents / 100);
}

/**
 * Read a typed amount as minor units.
 *
 * Rounding at the boundary is the point: `19.99 * 100` is 1998.9999… in
 * binary floating point, and truncating that would quietly undercharge by a
 * cent on the most ordinary price there is.
 */
export function parseCents(input: string): number {
  const amount = Number.parseFloat(input.replace(NON_NUMERIC, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}
