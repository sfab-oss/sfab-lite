import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import agents from "agents/vite";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const factoryPort = Number(process.env.FACTORY_PORT ?? 8790);
const factoryRoot = import.meta.dirname;

// The code viewers (@pierre/diffs) are client-only widgets, but they import
// shiki's full grammar bundle (~2.5 MiB gzip across ~200 lazy chunks) which
// would otherwise be emitted into the Worker upload and count against the
// 10 MB limit. Resolve them to an empty stub in the SSR environment.
function pierreClientOnly(): Plugin {
  const stub = resolve(factoryRoot, "src/components/code/pierre-ssr-stub.ts");
  return {
    name: "sfab-lite:pierre-client-only",
    enforce: "pre",
    resolveId(id) {
      if (id === "@pierre/diffs/react" && this.environment.name === "ssr") {
        return stub;
      }
      return null;
    },
  };
}

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
    pierreClientOnly(),
    agents(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // Check/lint/build are separate Workers (service bindings). Include
      // them in `vite dev` so the factory can call them locally; skip them in
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
        {
          configPath: resolve(factoryRoot, "../build/wrangler.jsonc"),
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
