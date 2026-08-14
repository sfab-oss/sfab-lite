import { addRecipeToWorkspace } from "../../add/hosted-add.js";
import { type ProtectedReply, protectedError } from "../../hono/reply.js";
import type { AddRecipeBody } from "../../hono/schemas.js";
import type { AppCtx } from "../../serve/routes.js";

export async function handleAddRecipe(rc: AppCtx, body: AddRecipeBody) {
  let result: Awaited<ReturnType<typeof addRecipeToWorkspace>>;
  try {
    result = await addRecipeToWorkspace(
      rc.env,
      rc.appId,
      body.name,
      body.workspaceId
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "add_failed";
    if (message.includes("not found") || message.includes("does not belong")) {
      return protectedError(message, 404);
    }
    return protectedError(message, 500);
  }
  if (!result.ok) {
    const status = result.collisions ? 409 : 400;
    return {
      status,
      body: {
        ok: false as const,
        error: result.error,
        collisions: result.collisions,
      },
    } satisfies ProtectedReply;
  }
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      added: result.added,
      skipped: result.skipped,
      recipes: result.recipes,
    },
  };
}
