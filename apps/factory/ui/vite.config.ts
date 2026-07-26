import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Factory console — Vite build for `ui/`, served via wrangler `assets`.
 *
 * Invoked from the package root as `vite --config ui/vite.config.ts`, so
 * `root` is pinned to this config's directory (Vite's default is cwd).
 *
 * Dev proxies API routes to the wrangler worker so UI edits do not require a
 * worker rebuild. Both ports are env-driven so several worktrees can run their
 * own factory at once; the defaults are the canonical pair.
 */
const uiPort = Number(process.env.UI_PORT ?? 5173);
const workerTarget = `http://localhost:${process.env.FACTORY_PORT ?? 8790}`;

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": `${import.meta.dirname}/src`,
    },
  },
  server: {
    port: uiPort,
    // `^/a/` is a regex on purpose. Vite matches a plain string context with
    // `url.startsWith(context)` (`doesProxyContextMatchUrl`), so a bare "/a"
    // would also capture `/apps`, `/apps/:id` and `/assets/*` — the console's
    // own routes — and proxy them to the worker instead of serving them from
    // Vite. Only a context beginning with `^` is treated as a pattern.
    proxy: {
      "/api": { target: workerTarget, changeOrigin: true },
      "/admin": { target: workerTarget, changeOrigin: true },
      "/agents": {
        target: workerTarget,
        changeOrigin: true,
        ws: true,
      },
      "^/a/": { target: workerTarget, changeOrigin: true },
      "/kernel": { target: workerTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
