/**
 * Client against src/contract/ + a handwritten fetch map, not dumped
 * `typeof api` / `hc<ApiType>`. If the client page stays near 145–281 MB,
 * UI types are the floor.
 *
 *   node scripts/run-measure.mjs measure-shallow-rpc.ts
 */

import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/starter-erp/seed" with { type: "json" };
import {
  clientPrefixesFromManifest,
  createAppLsState,
  getLanguageService,
} from "@sfab-lite/verbs/check";
import { SEED_MANIFEST } from "./seed-manifest.ts";

const CLIENT_ENTITIES = "/app/src/ui/routes/entities.tsx";
const HOOK_ENTITIES = "/app/src/ui/hooks/use-entities.ts";
const CLIENT_ENTRY = "/app/src/ui/main.tsx";
const CLIENT = "/app/src/ui/lib/client.ts";

const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort(),
];

const SHALLOW_CLIENT = `
import { publicBase } from "./public-base";

const base = publicBase ? \`\${publicBase}/api\` : "/api";

function api(method: string, path: string, body?: unknown) {
  return fetch(\`\${base}\${path}\`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const client = {
  protected: {
    entities: {
      $get: () => api("GET", "/protected/entities"),
      $post: (opts: { json: unknown }) =>
        api("POST", "/protected/entities", opts.json),
      ":id": {
        $patch: (opts: { param: { id: string }; json: unknown }) =>
          api("PATCH", \`/protected/entities/\${opts.param.id}\`, opts.json),
        $delete: (opts: { param: { id: string } }) =>
          api("DELETE", \`/protected/entities/\${opts.param.id}\`),
      },
    },
    products: {
      $get: () => api("GET", "/protected/products"),
      $post: (opts: { json: unknown }) =>
        api("POST", "/protected/products", opts.json),
      ":id": {
        $patch: (opts: { param: { id: string }; json: unknown }) =>
          api("PATCH", \`/protected/products/\${opts.param.id}\`, opts.json),
        $delete: (opts: { param: { id: string } }) =>
          api("DELETE", \`/protected/products/\${opts.param.id}\`),
      },
    },
    documents: {
      $get: () => api("GET", "/protected/documents"),
      $post: (opts: { json: unknown }) =>
        api("POST", "/protected/documents", opts.json),
      ":id": {
        $get: (opts: { param: { id: string } }) =>
          api("GET", \`/protected/documents/\${opts.param.id}\`),
        $delete: (opts: { param: { id: string } }) =>
          api("DELETE", \`/protected/documents/\${opts.param.id}\`),
        finalize: {
          $post: (opts: { param: { id: string } }) =>
            api("POST", \`/protected/documents/\${opts.param.id}/finalize\`),
        },
        lines: {
          $post: (opts: { param: { id: string }; json: unknown }) =>
            api("POST", \`/protected/documents/\${opts.param.id}/lines\`, opts.json),
          ":lineId": {
            $delete: (opts: { param: { id: string; lineId: string } }) =>
              api(
                "DELETE",
                \`/protected/documents/\${opts.param.id}/lines/\${opts.param.lineId}\`
              ),
          },
        },
      },
    },
    "session-context": {
      $get: () => api("GET", "/protected/session-context"),
    },
  },
};
`.trim();

const SHALLOW_ENTITIES_HOOK = `
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { entityCreateSchema } from "../../contract/entities";
import { client } from "../lib/client";

type EntitiesList = { data: Entity[] };
type Entity = {
  id: string;
  name: string;
  kind: "customer" | "vendor";
  email: string | null;
  taxId: string | null;
};
export type EntityKind = Entity["kind"];

const getEntitiesKey = () => ["entities"] as const;

export function useEntities() {
  return useQuery({
    queryKey: getEntitiesKey(),
    queryFn: async () => {
      const res = await client.protected.entities.$get();
      if (!res.ok) {
        throw new Error(\`entities \${res.status}\`);
      }
      const body = (await res.json()) as EntitiesList;
      return body.data;
    },
  });
}

type CreateEntityInput = z.infer<typeof entityCreateSchema>;

export function useCreateEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEntityInput) => {
      const res = await client.protected.entities.$post({ json: input });
      if (!res.ok) {
        throw new Error(\`create entity \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getEntitiesKey() });
    },
  });
}

export function useDeleteEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.protected.entities[":id"].$delete({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? "That party has documents and cannot be deleted."
            : \`delete entity \${res.status}\`
        );
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getEntitiesKey() });
    },
  });
}
`.trim();

const SHALLOW_SESSION_HOOK = `
import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/client";
import { queryClient } from "../lib/query-client";

export type Session =
  | {
      authenticated: false;
      needsOnboarding: boolean;
      user: null;
      session: null;
      organization: null;
    }
  | {
      authenticated: true;
      needsOnboarding: boolean;
      user: { id: string; email: string; name: string };
      session: { id: string; activeOrganizationId: string | null };
      organization: { id: string; name: string; slug: string } | null;
    };

const getSessionKey = () => ["session-context"] as const;

async function fetchSession(): Promise<Session> {
  const res = await client.protected["session-context"].$get();
  if (!res.ok) {
    throw new Error(\`session-context \${res.status}\`);
  }
  return (await res.json()) as Session;
}

export function useSession() {
  return useQuery({
    queryKey: getSessionKey(),
    queryFn: fetchSession,
  });
}

export function loadSession(): Promise<Session> {
  return queryClient.ensureQueryData({
    queryKey: getSessionKey(),
    queryFn: fetchSession,
  });
}

export function invalidateSession(): Promise<Session> {
  return queryClient.fetchQuery({
    queryKey: getSessionKey(),
    queryFn: fetchSession,
    staleTime: 0,
  });
}
`.trim();

const SHALLOW_PRODUCTS_HOOK = `
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { productCreateSchema } from "../../contract/products";
import { client } from "../lib/client";

const getProductsKey = () => ["products"] as const;

export function useProducts() {
  return useQuery({
    queryKey: getProductsKey(),
    queryFn: async () => {
      const res = await client.protected.products.$get();
      if (!res.ok) {
        throw new Error(\`products \${res.status}\`);
      }
      const body = (await res.json()) as { data: unknown[] };
      return body.data;
    },
  });
}

type CreateProductInput = z.infer<typeof productCreateSchema>;

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProductInput) => {
      const res = await client.protected.products.$post({ json: input });
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? "That SKU is already in the catalog."
            : \`create product \${res.status}\`
        );
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getProductsKey() });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.protected.products[":id"].$delete({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(\`delete product \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getProductsKey() });
    },
  });
}
`.trim();

const SHALLOW_DOCUMENTS_HOOK = `
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { documentCreateSchema, lineCreateSchema } from "../../contract/documents";
import { client } from "../lib/client";

const getDocumentsKey = () => ["documents"] as const;
const getDocumentKey = (id: string) => ["documents", id] as const;

export function documentReference(row: { number: number | null }): string {
  return row.number === null
    ? "Draft"
    : \`#\${String(row.number).padStart(4, "0")}\`;
}

export function useDocuments() {
  return useQuery({
    queryKey: getDocumentsKey(),
    queryFn: async () => {
      const res = await client.protected.documents.$get();
      if (!res.ok) {
        throw new Error(\`documents \${res.status}\`);
      }
      const body = (await res.json()) as { data: unknown[] };
      return body.data;
    },
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: getDocumentKey(id),
    queryFn: async () => {
      const res = await client.protected.documents[":id"].$get({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(\`document \${res.status}\`);
      }
      return await res.json();
    },
    enabled: !!id,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entityId: z.infer<typeof documentCreateSchema>["entityId"]) => {
      const res = await client.protected.documents.$post({
        json: { entityId },
      });
      if (!res.ok) {
        throw new Error(\`create document \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getDocumentsKey() });
    },
  });
}

type AddLineInput = z.infer<typeof lineCreateSchema> & { id: string };

export function useAddDocumentLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddLineInput) => {
      const { id, ...json } = input;
      const res = await client.protected.documents[":id"].lines.$post({
        param: { id },
        json,
      });
      if (!res.ok) {
        throw new Error(\`add line \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: getDocumentKey(input.id) });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.protected.documents[":id"].$delete({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(\`delete document \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getDocumentsKey() });
    },
  });
}

export function useDeleteDocumentLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; lineId: string }) => {
      const res = await client.protected.documents[":id"].lines[":lineId"].$delete({
        param: input,
      });
      if (!res.ok) {
        throw new Error(\`delete line \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: getDocumentKey(input.id) });
    },
  });
}

export function useFinalizeDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.protected.documents[":id"].finalize.$post({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(\`finalize \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: getDocumentKey(id) });
      queryClient.invalidateQueries({ queryKey: getDocumentsKey() });
    },
  });
}
`.trim();

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    files[`/app/${path}`] = text;
  }
}

function applyShallow(src: Record<string, string>): Record<string, string> {
  return {
    ...src,
    [CLIENT]: SHALLOW_CLIENT,
    [HOOK_ENTITIES]: SHALLOW_ENTITIES_HOOK,
    "/app/src/ui/hooks/use-session.ts": SHALLOW_SESSION_HOOK,
    "/app/src/ui/hooks/use-products.ts": SHALLOW_PRODUCTS_HOOK,
    "/app/src/ui/hooks/use-documents.ts": SHALLOW_DOCUMENTS_HOOK,
  };
}

const shallowFiles = applyShallow(files);
const allAppFiles = Object.keys(files).sort();

function heapMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
}

function overlayOf(src: Record<string, string>) {
  const st = createAppLsState(clientPrefixesFromManifest(SEED_MANIFEST));
  for (const [p, text] of Object.entries(src)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  return st;
}

function measure(
  label: string,
  programRoots: string[],
  src: Record<string, string>
) {
  const before = heapMb();
  const st = overlayOf(src);
  st.rootFiles = [...programRoots, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);

  const t0 = Date.now();
  let diagnostics = 0;
  for (const r of programRoots) {
    diagnostics += ls.getSemanticDiagnostics(r).length;
  }
  const ms = Date.now() - t0;

  const p = ls.getProgram();
  const sfs = p ? p.getSourceFiles() : [];
  const bytes = sfs.reduce((n, s) => n + s.text.length, 0);
  const honoFiles = sfs.filter((s) =>
    s.fileName.includes("/node_modules/hono/")
  ).length;
  const drizzleFiles = sfs.filter((s) =>
    s.fileName.includes("/node_modules/drizzle-orm/")
  ).length;
  const after = heapMb();
  const row = {
    label,
    programRoots: programRoots.length,
    loadedFiles: sfs.length,
    honoFiles,
    drizzleFiles,
    loadedTextMb: Number((bytes / 1_048_576).toFixed(2)),
    diagnostics,
    ms,
    heapRetainedMb: Number((after - before).toFixed(0)),
  };
  console.log(JSON.stringify(row));
  return row;
}

measure("union (today)", allAppFiles, files);
measure("union, shallow RPC", allAppFiles, shallowFiles);
measure("entities hook, import closure (today)", [HOOK_ENTITIES], files);
measure(
  "entities hook, import closure, shallow RPC",
  [HOOK_ENTITIES],
  shallowFiles
);
measure("entities page, import closure (today)", [CLIENT_ENTITIES], files);
measure(
  "entities page, import closure, shallow RPC",
  [CLIENT_ENTITIES],
  shallowFiles
);
measure("client entry, import closure (today)", [CLIENT_ENTRY], files);
measure(
  "client entry, import closure, shallow RPC",
  [CLIENT_ENTRY],
  shallowFiles
);
