import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { client } from "../lib/client";

const getDocumentsKey = () => ["documents"] as const;
const getDocumentKey = (id: string) => ["documents", id] as const;

/** Drafts have no number — one is drawn from the organization's sequence at finalize. */
export function documentReference(row: { number: number | null }): string {
  return row.number === null
    ? "Draft"
    : `#${String(row.number).padStart(4, "0")}`;
}

export function useDocuments() {
  return useQuery({
    queryKey: getDocumentsKey(),
    queryFn: async () => {
      const res = await client.protected.documents.$get();
      if (!res.ok) {
        throw new Error(`documents ${res.status}`);
      }
      const body = await res.json();
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
        throw new Error(`document ${res.status}`);
      }
      const body = await res.json();
      if ("error" in body) {
        throw new Error(`document ${res.status}`);
      }
      return body;
    },
    enabled: !!id,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entityId: string) => {
      const res = await client.protected.documents.$post({
        json: { entityId },
      });
      if (!res.ok) {
        throw new Error(`create document ${res.status}`);
      }
      const body = await res.json();
      if ("error" in body) {
        throw new Error(`create document ${res.status}`);
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getDocumentsKey() });
    },
  });
}

type AddLineInput = InferRequestType<
  (typeof client.protected.documents)[":id"]["lines"]["$post"]
>["json"] & { id: string };

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
        throw new Error(`add line ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: getDocumentKey(variables.id) });
      queryClient.invalidateQueries({ queryKey: getDocumentsKey() });
    },
  });
}

export function useDeleteDocumentLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; lineId: string }) => {
      const res = await client.protected.documents[":id"].lines[
        ":lineId"
      ].$delete({
        param: input,
      });
      if (!res.ok) {
        throw new Error(`delete line ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: getDocumentKey(variables.id) });
      queryClient.invalidateQueries({ queryKey: getDocumentsKey() });
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
        throw new Error(
          res.status === 409
            ? "A document needs at least one line before it can be issued."
            : `finalize document ${res.status}`
        );
      }
      return await res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: getDocumentKey(id) });
      queryClient.invalidateQueries({ queryKey: getDocumentsKey() });
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
        throw new Error(`delete document ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: getDocumentKey(id) });
      queryClient.invalidateQueries({ queryKey: getDocumentsKey() });
    },
  });
}
