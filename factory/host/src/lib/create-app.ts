import { errorMessage, throwIfUnauthorized } from "@/lib/api-errors";
import { client } from "@/lib/client";

/** Omit `name` / `template` and the server picks a placeholder + default starter. */
export async function createApp(name?: string, template?: string) {
  const json: { name?: string; template?: string } = {};
  if (name) {
    json.name = name;
  }
  if (template) {
    json.template = template;
  }
  const res = await client.protected.apps.$post({ json });
  throwIfUnauthorized(res);
  if (res.status !== 202) {
    throw new Error(await errorMessage(res, `create failed (${res.status})`));
  }
  const body = await res.json();
  let nameOut = "";
  if (typeof body.name === "string") {
    nameOut = body.name;
  } else if (typeof name === "string") {
    nameOut = name;
  }
  return {
    appId: body.appId,
    attemptId: body.attemptId,
    name: nameOut,
    template:
      typeof body.template === "string" ? body.template : (template ?? "base"),
  };
}
