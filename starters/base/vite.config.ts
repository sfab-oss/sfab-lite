import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Standalone dev/build for the payload in `app/`.
 *
 * Vite exists here only so the template is runnable on its own. In the
 * factory the same sources are compiled by esbuild-in-a-worker with an
 * import map, so the payload must stay inside the intersection of both
 * toolchains — see README "Payload rules". Notably: no path aliases (the
 * factory's resolver is relative-only), no `?raw`/`?url` imports, no
 * `import.meta.glob`.
 */
export default defineConfig({
  root: "app",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
