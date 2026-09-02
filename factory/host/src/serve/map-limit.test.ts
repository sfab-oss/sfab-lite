import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapLimit } from "./map-limit.ts";

describe("mapLimit", () => {
  it("returns results in input order", async () => {
    const out = await mapLimit([3, 1, 2], 2, async (n) => {
      await new Promise((r) => setTimeout(r, n * 5));
      return n * 10;
    });
    assert.deepEqual(out, [30, 10, 20]);
  });

  it("never runs more than the bound in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapLimit([1, 2, 3, 4, 5, 6], 2, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
    });
    assert.equal(peak, 2);
  });

  it("resolves an empty list without calling the mapper", async () => {
    let called = 0;
    const out = await mapLimit([], 16, () => {
      called += 1;
      return Promise.resolve(0);
    });
    assert.deepEqual(out, []);
    assert.equal(called, 0);
  });
});
