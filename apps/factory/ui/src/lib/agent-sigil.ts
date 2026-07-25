// biome-ignore-all lint/suspicious/noBitwiseOperators: xmur3/mulberry32 are
// standard integer-hash/PRNG routines — the bit ops are the algorithm.

/**
 * Generative agent identity — the headless generator.
 *
 * Turns an agent id (the `contractors` table's `ctr_…` id) into a dot-matrix
 * "sigil": which cells of a 5×5 grid are lit. The component in
 * `components/icons/agent-sigil.tsx` paints it; a Worker route could paint the
 * same grid to SVG/PNG server-side — this module has no React or DOM dependency
 * so it runs anywhere.
 *
 * The look is the SFab mark, seeded per-agent: uniform dots on the same grid as
 * the icon family, mirrored across the vertical axis so the result reads as a
 * stable emblem rather than noise, with the center node always lit — that node
 * is painted as the single brand-accent "spark", the same move as the logo's
 * central dot. Pure and deterministic: same id → same grid, forever, so nothing
 * ever needs to be stored. The id is the only source of truth.
 *
 * Stability note: changing GRID/density/hash here restyles EVERY agent at once
 * (nothing is persisted). If a look needs freezing, fork a versioned generator
 * rather than editing this one in place.
 */

/** 5×5 grid on the 24×24 icon canvas — odd, so there's a true center to mirror
 *  about and to seat the spark in, exactly like the dot-icon family. */
const SIGIL_GRID = 5;
/** Dot centers across the 24px canvas (4px pitch), matching `DotSpark` et al. */
export const SIGIL_STOPS = [4, 8, 12, 16, 20] as const;
/** Dot radius, matching the dot-icon family. */
export const SIGIL_DOT_R = 1.7;
/** Row/col index of the true center — the cell that becomes the accent spark. */
export const SIGIL_CENTER = (SIGIL_GRID - 1) / 2;

/** xmur3 string hash → a seed function. Deterministic, dependency-free, and
 *  identical on server and client (no `Math.random`, no `Date`). */
function xmur3(str: string): () => number {
  let h = 1_779_033_703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3_432_918_353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2_246_822_507);
    h = Math.imul(h ^ (h >>> 13), 3_266_489_909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 PRNG → a stream of floats in [0,1). Seeded by xmur3. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Build the lit-cell grid for an id. Only the left half (incl. the center
 * column) is sampled; the right half mirrors it. The center cell is always lit —
 * it becomes the accent spark.
 */
export function agentSigilGrid(id: string): boolean[][] {
  const seed = xmur3(id)();
  const rand = mulberry32(seed);
  const half = Math.ceil(SIGIL_GRID / 2); // columns 0..center are independent
  const rows: boolean[][] = [];
  for (let r = 0; r < SIGIL_GRID; r++) {
    const row: boolean[] = new Array(SIGIL_GRID).fill(false);
    for (let c = 0; c < half; c++) {
      const lit = rand() > 0.5;
      row[c] = lit;
      row[SIGIL_GRID - 1 - c] = lit; // mirror across the vertical axis
    }
    rows.push(row);
  }
  const centerRow = rows[SIGIL_CENTER];
  if (centerRow) {
    centerRow[SIGIL_CENTER] = true; // the shared central spark is always present
  }
  return rows;
}
