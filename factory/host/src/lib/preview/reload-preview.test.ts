import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appWorkspaceBasePath,
  clampToApp,
  clampToWorkspace,
  localhostDisplayPath,
  stripLocalhostDisplay,
} from "./reload-preview.ts";

test("appWorkspaceBasePath encodes the workspace id", () => {
  assert.equal(appWorkspaceBasePath("ws_1"), "/a/ws_1/workspace");
  assert.equal(
    appWorkspaceBasePath("a/b"),
    `/a/${encodeURIComponent("a/b")}/workspace`
  );
});

test("localhostDisplayPath prefixes relative paths", () => {
  assert.equal(localhostDisplayPath("/"), "http://localhost/");
  assert.equal(localhostDisplayPath("/login"), "http://localhost/login");
  assert.equal(localhostDisplayPath("settings"), "http://localhost/settings");
});

test("stripLocalhostDisplay accepts cosmetic localhost URLs", () => {
  assert.equal(stripLocalhostDisplay("http://localhost/login"), "/login");
  assert.equal(stripLocalhostDisplay("http://localhost:5173/"), "/");
  assert.equal(stripLocalhostDisplay("/login"), "/login");
});

test("clampToWorkspace stays under /workspace", () => {
  const workspaceId = "ws_x";
  assert.equal(clampToWorkspace(workspaceId, "/"), "/a/ws_x/workspace/");
  assert.equal(
    clampToWorkspace(workspaceId, "/login"),
    "/a/ws_x/workspace/login"
  );
  assert.equal(
    clampToWorkspace(workspaceId, "http://localhost/login"),
    "/a/ws_x/workspace/login"
  );
  assert.equal(
    clampToWorkspace(workspaceId, "https://evil.example/x"),
    "/a/ws_x/workspace/"
  );
  assert.equal(
    clampToWorkspace(workspaceId, "/a/ws_x/workspace/login"),
    "/a/ws_x/workspace/login"
  );
});

test("clampToApp live stays under /a/:appId", () => {
  assert.equal(clampToApp("app_1", "/login"), "/a/app_1/login");
});
