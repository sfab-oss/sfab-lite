import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  defaultSettingsMiddleware,
  type LanguageModel,
  wrapLanguageModel,
} from "ai";

const DEFAULT_MODEL_ID = "glm-5.2";

const ZAI_PROVIDER_NAME = "zaiCodingPlan";

const ZAI_PROVIDER_OPTIONS = {
  [ZAI_PROVIDER_NAME]: {
    thinking: { type: "enabled" as const },
    clear_thinking: false,
  },
};

/**
 * Z.AI coding-plan client. Outer `providerOptions` key must equal the
 * openai-compatible `name` — that client keys body passthrough off it, and
 * GLM's `delta.reasoning_content` only reaches the stream when thinking is
 * forced on.
 */
export function createZaiCodingModel(
  apiKey: string,
  modelId: string = DEFAULT_MODEL_ID
): LanguageModel {
  const model = createOpenAICompatible({
    name: ZAI_PROVIDER_NAME,
    baseURL: "https://api.z.ai/api/coding/paas/v4",
    apiKey,
  }).chatModel(modelId);

  return wrapLanguageModel({
    model,
    middleware: defaultSettingsMiddleware({
      settings: { providerOptions: ZAI_PROVIDER_OPTIONS },
    }),
  });
}

export function requireZaiApiKey(env: Env): string {
  const key = env.ZAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "ZAI_API_KEY is not set. Add it to factory/host/.dev.vars (local) or as a Worker secret."
    );
  }
  return key;
}
