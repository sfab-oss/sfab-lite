import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { publicBase } from "./public-base";

/**
 * Same-origin by default; prefixed when the factory mounts the app.
 *
 * The `/api/auth` suffix is **not** optional here, and `basePath` cannot
 * replace it. better-auth resolves its endpoint through `withPath()`
 * (`better-auth/dist/utils/url.mjs`), which appends the base path *only when
 * the given URL has none*:
 *
 *     if (checkHasPath(url)) return url;
 *
 * Standalone, `publicBase` is undefined, the client falls back to
 * `window.location.origin` — a pathless URL — and gets `/api/auth` appended.
 * Mounted under the factory, `publicBase` is `https://host/a/:appId`, which
 * already has a path, so the default is silently dropped and every call goes
 * to `/a/:appId/sign-in/email` instead of `/a/:appId/api/auth/sign-in/email`.
 * That 404s into the SPA shell, so sign-in fails with no console error.
 *
 * Passing `basePath` does not help: it is the very argument `withPath()`
 * discards on that branch. The suffix has to be part of the URL we hand over.
 * Keep it in step with `basePath` in `app/src/auth/index.ts`.
 */
const authClientOptions = {
  plugins: [organizationClient()],
  baseURL: publicBase ? `${publicBase}/api/auth` : undefined,
};
export const authClient = createAuthClient(authClientOptions);
