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
      "@": resolve(factoryRoot, "ui/src"),
    },
  },
  plugins: [
    agents(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      auxiliaryWorkers: [
        { configPath: resolve(factoryRoot, "../check/wrangler.jsonc") },
        { configPath: resolve(factoryRoot, "../lint/wrangler.jsonc") },
      ],
    }),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
