import { errorMessage, throwIfUnauthorized } from "@/lib/api-errors";
import { client } from "@/lib/client";

const APP_READY_POLL_MS = 800;
const APP_READY_TIMEOUT_MS = 120_000;

async function fetchApp(appId: string) {
  const res = await client.protected.apps[":appId"].$get({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `get app failed (${res.status})`));
  }
  const body = await res.json();
  return body.app;
}

export async function waitForAppReady(appId: string): Promise<void> {
  const deadline = Date.now() + APP_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const app = await fetchApp(appId);
    if (app.status === "ready") {
      return;
    }
    if (app.status === "failed") {
      throw new Error("app creation failed");
    }
    await new Promise((resolve) => setTimeout(resolve, APP_READY_POLL_MS));
  }
  throw new Error("app creation timed out");
}
