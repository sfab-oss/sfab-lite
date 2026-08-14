import assert from "node:assert/strict";
import { test } from "node:test";
import { serveRegistryItem } from "./serve-registry.ts";

const get = (path: string) => new Request(`https://lite.sfab.dev/r/${path}`);
const head = (path: string) =>
  new Request(`https://lite.sfab.dev/r/${path}`, { method: "HEAD" });

test("GET /r/button.json is a built item named button", async () => {
  const res = await serveRegistryItem(get("button.json").clone(), "button");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  const item = (await res.json()) as {
    name: string;
    registryDependencies: string[];
    files: Array<{ target: string; content: string }>;
  };
  assert.equal(item.name, "button");
  assert.deepEqual(item.registryDependencies, ["@lite/utils"]);
  assert.ok(
    item.files.some(
      (f) => f.target === "src/components/ui/button.tsx" && f.content.length > 0
    )
  );
});

test("HEAD /r/button.json is 200 without a body", async () => {
  const res = await serveRegistryItem(head("button.json"), "button");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
});

test("unknown slugs 404", async () => {
  const res = await serveRegistryItem(get("nope.json"), "nope");
  assert.equal(res.status, 404);
});

test("bare-looking paths with dots are refused", async () => {
  const res = await serveRegistryItem(get("../button.json"), "../button");
  assert.equal(res.status, 404);
});
