import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { publicBase } from "./public-base";

/** Same-origin by default; prefixed when the factory mounts the app. */
export const authClient = createAuthClient({
  ...(publicBase ? { baseURL: publicBase } : {}),
  plugins: [organizationClient()],
});
