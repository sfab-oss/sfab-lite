import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

/**
 * Calls into the entities API. Kept out of the components so the pages stay
 * about rendering — and so the typed client is used in one place per resource.
 */
export const entitiesQueryOptions = queryOptions({
  queryKey: ["entities"],
  queryFn: async () => {
    const res = await api.api.entities.$get();
    if (!res.ok) {
      throw new Error(`entities ${res.status}`);
    }
    const { entities } = await res.json();
    return entities;
  },
});

type Entity = Awaited<
  ReturnType<NonNullable<typeof entitiesQueryOptions.queryFn>>
>[number];

export type EntityKind = Entity["kind"];

export async function createEntity(input: {
  name: string;
  kind: EntityKind;
  email: string | null;
  taxId: string | null;
}) {
  const res = await api.api.entities.$post({ json: input });
  if (!res.ok) {
    throw new Error(`create entity ${res.status}`);
  }
  return await res.json();
}

export async function deleteEntity(id: string) {
  const res = await api.api.entities[":id"].$delete({ param: { id } });
  if (!res.ok) {
    throw new Error(
      res.status === 409
        ? "That party has documents and cannot be deleted."
        : `delete entity ${res.status}`
    );
  }
  return await res.json();
}
