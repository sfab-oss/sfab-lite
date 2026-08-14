import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import agents from "agents/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const factoryPort = Number(process.env.FACTORY_PORT ?? 8790);
const factoryRoot = import.meta.dirname;

export default defineConfig({
  server: {
    port: factoryPort,
  },
  resolve: {
    alias: {
      "@": resolve(factoryRoot, "src"),
    },
  },
  plugins: [
    agents(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // Check/lint are separate Workers (service bindings). Include them in
      // `vite dev` so the factory can call them locally; skip them in
      // `vite build` — they are built/deployed from their own packages, and
      // bundling them next to the factory SSR (kernel) OOMs CI.
      auxiliaryWorkers: [
        {
          configPath: resolve(factoryRoot, "../check/wrangler.jsonc"),
          devOnly: true,
        },
        {
          configPath: resolve(factoryRoot, "../lint/wrangler.jsonc"),
          devOnly: true,
        },
      ],
    }),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
