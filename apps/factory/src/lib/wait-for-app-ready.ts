import { getApp } from "@/api";

const APP_READY_POLL_MS = 800;
const APP_READY_TIMEOUT_MS = 120_000;

export async function waitForAppReady(appId: string): Promise<void> {
  const deadline = Date.now() + APP_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const app = await getApp(appId);
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
