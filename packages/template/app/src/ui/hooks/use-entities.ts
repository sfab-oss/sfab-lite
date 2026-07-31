import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { client } from "../lib/client";

type EntitiesList = InferResponseType<
  (typeof client.protected.entities)["$get"],
  200
>;
type Entity = EntitiesList["data"][number];
export type EntityKind = Entity["kind"];

const getEntitiesKey = () => ["entities"] as const;

export function useEntities() {
  return useQuery({
    queryKey: getEntitiesKey(),
    queryFn: async () => {
      const res = await client.protected.entities.$get();
      if (!res.ok) {
        throw new Error(`entities ${res.status}`);
      }
      const body = await res.json();
      return body.data;
    },
  });
}

type CreateEntityInput = InferRequestType<
  (typeof client.protected.entities)["$post"]
>["json"];

export function useCreateEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEntityInput) => {
      const res = await client.protected.entities.$post({ json: input });
      if (!res.ok) {
        throw new Error(`create entity ${res.status}`);
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
            : `delete entity ${res.status}`
        );
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getEntitiesKey() });
    },
  });
}
