import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dataIdForTarget,
  parseSeedTarget,
  pathPrefixForTarget,
  serveId,
  wsDataId,
} from "./serve-target.ts";

test("wsDataId is keyed by workspace id", () => {
  assert.equal(wsDataId("ws_1"), "ws_1:ws");
});

test("live target ids and paths", () => {
  const target = { mode: "live" as const, appId: "app_1" };
  assert.equal(serveId(target), "app_1");
  assert.equal(dataIdForTarget(target), "app_1:live");
  assert.equal(pathPrefixForTarget(target), "/a/app_1");
});

test("preview target ids and paths", () => {
  const target = { mode: "preview" as const, appId: "app_1", prNumber: 3 };
  assert.equal(serveId(target), "app_1");
  assert.equal(dataIdForTarget(target), "app_1:pr:3");
  assert.equal(pathPrefixForTarget(target), "/a/app_1/preview/3");
});

test("workspace target ids and paths encode the workspace id", () => {
  const target = { mode: "workspace" as const, workspaceId: "ws_1" };
  assert.equal(serveId(target), "ws_1");
  assert.equal(dataIdForTarget(target), "ws_1:ws");
  assert.equal(pathPrefixForTarget(target), "/a/ws_1/workspace");
});

test("workspace path encodes special characters in the id", () => {
  assert.equal(
    pathPrefixForTarget({ mode: "workspace", workspaceId: "ws_a/b" }),
    "/a/ws_a%2Fb/workspace"
  );
});

const deps = { appId: "app_1", workspaceId: "ws_1" };

test("pnpm seed defaults to the computer workspace DB", () => {
  assert.deepEqual(parseSeedTarget(deps, []), {
    mode: "workspace",
    workspaceId: "ws_1",
  });
  assert.deepEqual(parseSeedTarget(deps, ["--workspace"]), {
    mode: "workspace",
    workspaceId: "ws_1",
  });
});

test("pnpm seed --live targets live", () => {
  assert.deepEqual(parseSeedTarget(deps, ["--live"]), {
    mode: "live",
    appId: "app_1",
  });
});

test("pnpm seed refuses both --live and --workspace", () => {
  const result = parseSeedTarget(deps, ["--live", "--workspace"]);
  assert.ok("error" in result);
});
