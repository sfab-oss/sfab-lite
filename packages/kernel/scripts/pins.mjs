/**
 * Kernel pins: shared app surface is derived from packages/template so a
 * template bump cannot silently diverge from the frozen universe. Kernel-only
 * tooling pins (esbuild, typescript) stay hand-written — they are not the
 * template's TypeScript (root/template use 7.x; the types VFS ships 6.0.3
 * libs for apps/check — see README.md).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const KERNEL_VERSION = "0.3.0";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatePkg = JSON.parse(
  readFileSync(join(root, "..", "template", "package.json"), "utf8")
);

/** Exact versions declared on the template (deps or devDeps). */
function templatePin(name) {
  const version =
    templatePkg.dependencies?.[name] ?? templatePkg.devDependencies?.[name];
  if (typeof version !== "string") {
    throw new Error(
      `shared kernel pin "${name}" is missing from packages/template/package.json`
    );
  }
  if (
    version.startsWith("^") ||
    version.startsWith("~") ||
    version.includes("workspace:") ||
    version.includes("||")
  ) {
    throw new Error(
      `shared kernel pin "${name}" must be an exact version in the template, got ${JSON.stringify(version)}`
    );
  }
  return version;
}

/** Tooling the kernel prebuild owns — not mirrored from the template. */
const TOOLING_PINS = {
  esbuild: "0.28.1",
  // Types VFS lib/*.d.ts come from this compiler. apps/check must match.
  typescript: "6.0.3",
};

/**
 * Key order is fixed so kernel.json stays byte-stable across refactors of
 * how pins are sourced.
 */
export const PINS = {
  react: templatePin("react"),
  "react-dom": templatePin("react-dom"),
  "better-auth": templatePin("better-auth"),
  "drizzle-orm": templatePin("drizzle-orm"),
  hono: templatePin("hono"),
  esbuild: TOOLING_PINS.esbuild,
  typescript: TOOLING_PINS.typescript,
  tailwindcss: templatePin("tailwindcss"),
  "@tanstack/react-router": templatePin("@tanstack/react-router"),
  "@tanstack/react-query": templatePin("@tanstack/react-query"),
  "@base-ui/react": templatePin("@base-ui/react"),
  zod: templatePin("zod"),
};

/**
 * Direct deps installed into packages/kernel/universe but not listed in
 * kernel.json pins (client chunks / JSX types). Versions must stay exact.
 * @cloudflare/workers-types is intentionally absent — see README.md.
 */
export const UNIVERSE_EXTRA_PINS = {
  "@types/react": templatePin("@types/react"),
  "@types/react-dom": templatePin("@types/react-dom"),
  clsx: templatePin("clsx"),
  "class-variance-authority": templatePin("class-variance-authority"),
  "tailwind-merge": templatePin("tailwind-merge"),
};
