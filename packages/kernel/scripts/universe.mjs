/**
 * Isolated dependency universe for kernel prebuild.
 *
 * All vendoring / types-VFS resolution goes through packages/kernel/universe
 * (its own package.json + pnpm-lock.yaml + node_modules). Workspace packages
 * must not influence what gets bundled or typed.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const universeRoot = join(root, "universe");
export const universePkgPath = join(universeRoot, "package.json");
export const universeNodeModules = join(universeRoot, "node_modules");

/** Fake containing file so TS module walks find universe/node_modules first. */
export const universeResolveContainingFile = join(
  universeRoot,
  "_resolve_anchor.ts"
);

const universeRootNorm = universeRoot.replaceAll("\\", "/");

export function assertUniverseInstalled() {
  if (!(existsSync(universePkgPath) && existsSync(universeNodeModules))) {
    throw new Error(
      "kernel universe is not installed — run: pnpm --filter @sfab-lite/kernel install-universe"
    );
  }
}

/** createRequire rooted at the universe manifest (not the workspace). */
export function getUniverseRequire() {
  assertUniverseInstalled();
  return createRequire(universePkgPath);
}

function isUnderUniverse(abs) {
  const norm = abs.replaceAll("\\", "/");
  return norm === universeRootNorm || norm.startsWith(`${universeRootNorm}/`);
}

/** @param {string} spec @param {string[]} externals */
function matchExternal(spec, externals) {
  for (const ext of externals) {
    if (ext.endsWith("/*")) {
      const base = ext.slice(0, -2);
      if (spec === base || spec.startsWith(`${base}/`)) {
        return true;
      }
      continue;
    }
    if (ext.endsWith(":*")) {
      const prefix = ext.slice(0, -1);
      if (spec.startsWith(prefix)) {
        return true;
      }
      continue;
    }
    if (spec === ext) {
      return true;
    }
  }
  return false;
}

function isRelativeOrAbsolute(spec) {
  return (
    spec.startsWith("./") ||
    spec.startsWith("../") ||
    spec.startsWith("/") ||
    spec.startsWith("file:")
  );
}

function isFlatVendorRelink(spec) {
  return spec.endsWith(".js") && !spec.includes("/") && !spec.startsWith("@");
}

/**
 * @param {import("esbuild").OnResolveArgs} args
 * @param {string[]} externals
 * @returns {{ path: string, external: true } | null}
 */
function earlyExternal(args, externals) {
  const spec = args.path;
  if (isFlatVendorRelink(spec) || matchExternal(spec, externals)) {
    return { path: spec, external: true };
  }
  return null;
}

/**
 * @param {import("esbuild").OnResolveArgs} args
 * @param {import("esbuild").OnResolveResult} result
 */
function afterUniverseResolve(args, result) {
  const spec = args.path;
  if (result.errors.length > 0) {
    // Optional / missing peers (e.g. @opentelemetry/api): keep external
    // so the bundle matches the prior workspace behaviour for soft deps.
    if (args.kind === "dynamic-import") {
      return { path: spec, external: true };
    }
    return {
      errors: [
        {
          text: `not in kernel universe (packages/kernel/universe): ${spec}`,
          detail: result.errors.map((e) => e.text).join("; "),
        },
      ],
    };
  }
  if (result.path && !isUnderUniverse(result.path) && !result.external) {
    return {
      errors: [
        {
          text: `resolved outside kernel universe: ${spec} → ${result.path}`,
        },
      ],
    };
  }
  return result;
}

/**
 * esbuild plugin: resolve bare specifiers only from the isolated universe.
 * Uses esbuild's own resolver (export conditions intact) with resolveDir
 * forced under universe/, so workspace peers cannot win.
 * Register AFTER any flat-vendor / rewrite plugins so those win first.
 */
export function universeResolvePlugin() {
  assertUniverseInstalled();
  return {
    name: "kernel-universe-resolve",
    setup(build) {
      const externals = build.initialOptions.external ?? [];
      build.onResolve({ filter: /.*/ }, async (args) => {
        // Re-entrancy: let esbuild's default resolver finish.
        if (args.pluginData?.universeDefault) {
          return;
        }
        if (args.kind === "entry-point" || isRelativeOrAbsolute(args.path)) {
          return;
        }
        const early = earlyExternal(args, externals);
        if (early) {
          return early;
        }

        const resolveDir =
          args.importer && isUnderUniverse(args.importer)
            ? dirname(args.importer)
            : universeNodeModules;

        const result = await build.resolve(args.path, {
          kind: args.kind,
          importer: args.importer,
          resolveDir,
          namespace: args.namespace,
          pluginData: { universeDefault: true },
        });

        return afterUniverseResolve(args, result);
      });
    },
  };
}
