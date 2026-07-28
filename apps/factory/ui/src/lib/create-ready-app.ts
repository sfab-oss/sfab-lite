import { createApp } from "@/api";
import { waitForAppReady } from "@/lib/wait-for-app-ready";

/** Create an app and wait until it is ready to open. */
export async function createReadyApp(name?: string): Promise<{
  appId: string;
  name: string;
}> {
  const created = await createApp(name);
  await waitForAppReady(created.appId);
  return { appId: created.appId, name: created.name };
}
