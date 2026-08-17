import { z } from "zod";
import type {
  AdapterTarget,
  ManifestCapability,
  ManifestV0,
} from "./manifest.js";

const FORMAT = 0;
const TARGETS: readonly AdapterTarget[] = ["cloudflare"];
const KNOWN_CAPABILITIES: readonly ManifestCapability[] = ["storage"];
const CAPABILITIES_LIST = KNOWN_CAPABILITIES.join(", ");

export interface ManifestIssue {
  path: string;
  message: string;
}

export type ManifestValidation =
  | { ok: true; manifest: ManifestV0 }
  | { ok: false; issues: ManifestIssue[] };

const LINE_PIN = /^\^\d+$/;
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const RECIPE_NAME_RE =
  /^lite\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const INTERPOLATION = /\$\{|\{\{/;

function plainString() {
  return z
    .string({ error: "expected a string" })
    .min(1, { error: "expected a non-empty string" })
    .refine((s) => !INTERPOLATION.test(s), {
      error: "interpolation is not allowed",
    });
}

function exactVersion() {
  return plainString().refine((s) => EXACT_VERSION_RE.test(s), {
    error: "expected an exact version (no ranges)",
  });
}

function stringArray() {
  return z.array(plainString(), { error: "expected an array of strings" });
}

function exactObject<T extends z.ZodRawShape>(shape: T, error: string) {
  return z.strictObject(shape, { error });
}

const serverSchema = exactObject(
  {
    entry: plainString(),
    exportName: plainString(),
  },
  "expected an object"
);

const clientSchema = exactObject(
  {
    entry: plainString(),
    styles: plainString(),
  },
  "expected an object"
);

const sourceSchema = exactObject(
  {
    dirs: stringArray(),
    extensions: stringArray(),
    files: stringArray(),
    exclude: stringArray(),
  },
  "expected an object"
);

const injectSchema = z
  .record(z.string(), plainString(), { error: "expected an object" })
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (INTERPOLATION.test(key)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "interpolation is not allowed",
        });
      }
    }
  });

const moduleSchema = exactObject(
  {
    name: plainString(),
    version: exactVersion(),
  },
  "expected an object"
);

const recipeFilesSchema = z
  .record(
    z.string(),
    plainString().regex(SHA256_RE, {
      error: "expected sha256:<64 lowercase hex>",
    }),
    { error: "expected an object" }
  )
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (INTERPOLATION.test(key)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "interpolation is not allowed",
        });
      }
    }
  });

const recipeSchema = exactObject(
  {
    version: exactVersion(),
    files: recipeFilesSchema,
  },
  "expected an object"
);

const recipeNameSchema = z.string().regex(RECIPE_NAME_RE, {
  error: "recipe names must be lite/<slug> (bare names are an error)",
});

const adapterSchema = plainString().superRefine((value, ctx) => {
  if (!(TARGETS as readonly string[]).includes(value)) {
    ctx.addIssue({
      code: "custom",
      message: `unknown adapter target "${value}"`,
    });
  }
});

const capabilitySchema = plainString().superRefine((value, ctx) => {
  if (!(KNOWN_CAPABILITIES as readonly string[]).includes(value)) {
    ctx.addIssue({
      code: "custom",
      message: `unknown capability "${value}" (allowed: ${CAPABILITIES_LIST})`,
    });
  }
});

export const manifestV0Schema = exactObject(
  {
    format: z.literal(FORMAT, { error: `expected literal ${FORMAT}` }),
    name: plainString(),
    runtime: plainString().refine((s) => LINE_PIN.test(s), {
      error: "expected a line pin ^N (integer N)",
    }),
    adapter: adapterSchema,
    root: plainString(),
    server: serverSchema,
    client: clientSchema,
    html: plainString(),
    safelist: plainString(),
    migrations: plainString(),
    schema: plainString(),
    inject: injectSchema,
    source: sourceSchema,
    capabilities: z.array(capabilitySchema, {
      error: "expected an array of strings",
    }),
    modules: z.array(moduleSchema, { error: "expected an array" }),
    recipes: z.record(recipeNameSchema, recipeSchema, {
      error: "expected an object",
    }),
  },
  "expected a JSON object"
);

export const requestManifestSchema = z
  .unknown()
  .transform((value, ctx): ManifestV0 => {
    if (
      value === undefined ||
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      ctx.addIssue({ code: "custom", message: "body.manifest required" });
      return z.NEVER;
    }
    const validated = validateManifest(value);
    if (!validated.ok) {
      const issue = validated.issues[0];
      ctx.addIssue({
        code: "custom",
        message: issue
          ? `body.manifest: ${issue.path}: ${issue.message}`
          : "body.manifest required",
      });
      return z.NEVER;
    }
    return validated.manifest;
  });

function formatPath(path: PropertyKey[]): string {
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") {
      out += `[${seg}]`;
    } else {
      const key = String(seg);
      out = out === "" ? key : `${out}.${key}`;
    }
  }
  return out;
}

function flattenIssues(
  issues: z.core.$ZodIssue[],
  prefix: PropertyKey[] = []
): ManifestIssue[] {
  const out: ManifestIssue[] = [];
  for (const issue of issues) {
    const path = [...prefix, ...issue.path];
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        out.push({
          path: formatPath([...path, key]),
          message: "unknown key",
        });
      }
      continue;
    }
    if (issue.code === "invalid_key") {
      out.push(...flattenIssues(issue.issues, path));
      continue;
    }
    if (issue.code === "invalid_union") {
      const nested = issue.errors[0];
      if (nested) {
        out.push(...flattenIssues(nested, path));
      } else {
        out.push({ path: formatPath(path), message: issue.message });
      }
      continue;
    }
    out.push({ path: formatPath(path), message: issue.message });
  }
  return out;
}

export function validateManifest(input: unknown): ManifestValidation {
  const result = manifestV0Schema.safeParse(input);
  if (result.success) {
    return { ok: true, manifest: result.data as ManifestV0 };
  }
  return { ok: false, issues: flattenIssues(result.error.issues) };
}
