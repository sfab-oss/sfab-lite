import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

/** Calls into the documents API. See `entities.ts` for the shape being followed. */
export const documentsQueryOptions = queryOptions({
  queryKey: ["documents"],
  queryFn: async () => {
    const res = await api.api.documents.$get();
    if (!res.ok) {
      throw new Error(`documents ${res.status}`);
    }
    const { documents } = await res.json();
    return documents;
  },
});

/** Drafts have no number — one is drawn from the organization's sequence at finalize. */
export function documentReference(row: { number: number | null }): string {
  return row.number === null
    ? "Draft"
    : `#${String(row.number).padStart(4, "0")}`;
}

async function fetchDocument(id: string) {
  const res = await api.api.documents[":id"].$get({ param: { id } });
  if (!res.ok) {
    throw new Error(`document ${res.status}`);
  }
  return await res.json();
}

export function documentQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["documents", id],
    queryFn: () => fetchDocument(id),
  });
}

export async function createDocument(entityId: string) {
  const res = await api.api.documents.$post({ json: { entityId } });
  if (!res.ok) {
    throw new Error(`create document ${res.status}`);
  }
  return await res.json();
}

export async function addDocumentLine(input: {
  id: string;
  productId: string | null;
  name?: string;
  quantity: number;
  unitPriceCents?: number;
}) {
  const { id, ...json } = input;
  const res = await api.api.documents[":id"].lines.$post({
    param: { id },
    json,
  });
  if (!res.ok) {
    throw new Error(`add line ${res.status}`);
  }
  return await res.json();
}

export async function deleteDocumentLine(input: {
  id: string;
  lineId: string;
}) {
  const res = await api.api.documents[":id"].lines[":lineId"].$delete({
    param: input,
  });
  if (!res.ok) {
    throw new Error(`delete line ${res.status}`);
  }
  return await res.json();
}

export async function finalizeDocument(id: string) {
  const res = await api.api.documents[":id"].finalize.$post({ param: { id } });
  if (!res.ok) {
    throw new Error(
      res.status === 409
        ? "A document needs at least one line before it can be issued."
        : `finalize document ${res.status}`
    );
  }
  return await res.json();
}

export async function deleteDocument(id: string) {
  const res = await api.api.documents[":id"].$delete({ param: { id } });
  if (!res.ok) {
    throw new Error(`delete document ${res.status}`);
  }
  return await res.json();
}
