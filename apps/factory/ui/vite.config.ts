import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Factory console — Vite build for `ui/`, served via wrangler `assets`.
 *
 * Invoked from the package root as `vite --config ui/vite.config.ts`, so
 * `root` is pinned to this config's directory (Vite's default is cwd).
 *
 * Dev proxies API routes to the wrangler worker on :8790 so UI edits do not
 * require a worker rebuild.
 */
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // `^/a/` is a regex on purpose. Vite matches a plain string context with
    // `url.startsWith(context)` (`doesProxyContextMatchUrl`), so a bare "/a"
    // would also capture `/apps`, `/apps/:id` and `/assets/*` — the console's
    // own routes — and proxy them to the worker instead of serving them from
    // Vite. Only a context beginning with `^` is treated as a pattern.
    proxy: {
      "/api": { target: "http://localhost:8790", changeOrigin: true },
      "/admin": { target: "http://localhost:8790", changeOrigin: true },
      "^/a/": { target: "http://localhost:8790", changeOrigin: true },
      "/kernel": { target: "http://localhost:8790", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
