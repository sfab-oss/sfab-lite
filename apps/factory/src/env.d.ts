import type { AppDO } from "./app-do.js";

declare global {
  interface Env {
    LOADER: WorkerLoader;
    APP_DO: DurableObjectNamespace<AppDO>;
    /** Service binding → sfab-lite-check */
    CHECK: Fetcher;
    /** Service binding → sfab-lite-lint */
    LINT: Fetcher;
    /**
     * Required to serve any app — the host injects it into every sub-app.
     * Without it `/a/:appId/*` fails at runtime with a 500 (`serve.ts`),
     * so a deploy that omits it produces a factory that boots fine and
     * cannot serve a single app. Not optional; the guard in `serve.ts`
     * stays because the type cannot enforce a secret being set.
     */
    BETTER_AUTH_SECRET: string;
    /** When set, all `/admin/*` require matching `X-Admin-Token`. */
    ADMIN_TOKEN?: string;
  }
}
