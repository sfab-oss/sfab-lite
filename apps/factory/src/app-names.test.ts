import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_NAME_MAX_LENGTH, pickAppName } from "./app-names.ts";

/** Every name the pool can yield, by draining it against itself. */
function allNames(): string[] {
  const seen: string[] = [];
  for (;;) {
    const next = pickAppName(seen);
    if (seen.includes(next)) {
      return seen;
    }
    seen.push(next);
  }
}

describe("pickAppName", () => {
  it("never returns a name already taken", () => {
    const names = allNames();
    for (let i = 0; i < names.length; i++) {
      const taken = names.slice(0, i);
      assert.ok(!taken.includes(pickAppName(taken)));
    }
  });

  it("ignores case and surrounding space when matching taken names", () => {
    const [first] = allNames();
    assert.ok(first);
    const picked = pickAppName([`  ${first.toUpperCase()}  `]);
    assert.notEqual(picked.toLowerCase(), first.toLowerCase());
  });

  it("repeats rather than failing once the pool is exhausted", () => {
    const names = allNames();
    assert.ok(names.includes(pickAppName(names)));
  });

  it("offers enough names to be worth avoiding collisions", () => {
    assert.ok(allNames().length >= 32);
  });

  it("fits the length the routes accept", () => {
    for (const name of allNames()) {
      assert.ok(name.length <= APP_NAME_MAX_LENGTH, name);
    }
  });
});
