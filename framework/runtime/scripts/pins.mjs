/**
 * Runtime universe pins. The runtime owns these versions; the starter
 * conforms to them (check:workspace), never the reverse. A starter
 * package.json edit must not change this file's exports.
 *
 * Tooling pins (esbuild, typescript) are not starter surface — types VFS
 * lib/*.d.ts come from this compiler and factory/check must match.
 *
 * Key order is fixed so kernel.json stays byte-stable across refactors of
 * how pins are sourced.
 */
export const KERNEL_VERSION = "0.4.0";

const TOOLING_PINS = {
  esbuild: "0.28.1",
  typescript: "6.0.3",
};

export const PINS = {
  react: "19.2.8",
  "react-dom": "19.2.8",
  "better-auth": "1.6.19",
  "drizzle-orm": "0.45.2",
  hono: "4.12.31",
  esbuild: TOOLING_PINS.esbuild,
  typescript: TOOLING_PINS.typescript,
  tailwindcss: "4.1.11",
  "@tanstack/react-router": "1.129.0",
  "@tanstack/react-query": "5.83.0",
  "@base-ui/react": "1.6.0",
  "@radix-ui/react-icons": "1.3.2",
  zod: "4.3.5",
};

/**
 * Direct deps installed into framework/runtime/universe but not listed in
 * kernel.json pins (client chunks / JSX types). Versions must stay exact.
 * @cloudflare/workers-types is intentionally absent — see README.md.
 */
export const UNIVERSE_EXTRA_PINS = {
  "@types/react": "19.1.8",
  "@types/react-dom": "19.1.6",
  clsx: "2.1.1",
  "class-variance-authority": "0.7.1",
  "tailwind-merge": "3.3.1",
};
