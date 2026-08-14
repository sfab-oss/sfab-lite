import { errorMessage, throwIfUnauthorized } from "@/lib/api-errors";
import { client } from "@/lib/client";

/** Omit `name` and the server picks a placeholder from the prompt context. */
export async function createApp(name?: string) {
  const res = await client.protected.apps.$post({
    json: name ? { name } : {},
  });
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
  };
}
