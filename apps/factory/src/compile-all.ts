import { buildIndexHtml, compileClient } from "./compile-client.js";
import { compileCss } from "./compile-css.js";
import { compileServer } from "./compile-server.js";

/**
 * Compile server + client + css into serveable assets.
 * Shared by CD and workspace WIP preview (workspace skips lint/check).
 */
export async function compileAll(files: Record<string, string>) {
  const compiled = await compileServer(files);
  const client = await compileClient(files);
  const css = await compileCss(files);
  const assets: Record<string, string> = {
    "index.html": buildIndexHtml({
      kernelVersion: compiled.kernelVersion,
    }),
    "assets/app.js": client.js,
    "assets/app.css": css.css,
  };
  return { compiled, client, css, assets };
}
