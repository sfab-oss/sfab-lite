import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appWorkspaceBasePath,
  clampToApp,
  localhostDisplayPath,
  stripLocalhostDisplay,
} from "./reload-preview.ts";

test("appWorkspaceBasePath encodes the app id", () => {
  assert.equal(appWorkspaceBasePath("app_1"), "/a/app_1/workspace");
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

test("clampToApp workspace mode stays under /workspace", () => {
  const appId = "app_x";
  assert.equal(clampToApp(appId, "/", "workspace"), "/a/app_x/workspace/");
  assert.equal(
    clampToApp(appId, "/login", "workspace"),
    "/a/app_x/workspace/login"
  );
  assert.equal(
    clampToApp(appId, "http://localhost/login", "workspace"),
    "/a/app_x/workspace/login"
  );
  assert.equal(
    clampToApp(appId, "https://evil.example/x", "workspace"),
    "/a/app_x/workspace/"
  );
  assert.equal(
    clampToApp(appId, "/a/app_x/workspace/login", "workspace"),
    "/a/app_x/workspace/login"
  );
});
