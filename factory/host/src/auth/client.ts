import { createAuthClient } from "better-auth/react";

/** Same-origin auth client; Vite proxies `/api` to the factory worker in dev. */
export const authClient = createAuthClient({
  basePath: "/api/auth",
});
