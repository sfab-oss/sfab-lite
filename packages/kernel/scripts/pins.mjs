/**
 * Kernel dependency pins — must match packages/template exactly for the
 * shared surface (and the build tooling pins listed in kernel.json).
 */
export const KERNEL_VERSION = "0.2.0";

export const PINS = {
  react: "19.2.8",
  "react-dom": "19.2.8",
  "better-auth": "1.6.19",
  "drizzle-orm": "0.45.2",
  hono: "4.12.31",
  esbuild: "0.28.1",
  typescript: "6.0.3",
  tailwindcss: "4.1.11",
  "@tanstack/react-router": "1.129.0",
  "@tanstack/react-query": "5.83.0",
  "@base-ui/react": "1.6.0",
  zod: "4.3.5",
};
