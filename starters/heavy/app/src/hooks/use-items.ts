import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { client } from "../lib/client";

const itemsKey = () => ["items"] as const;

export function useItems() {
  return useQuery({
    queryKey: itemsKey(),
    queryFn: async () => {
      const res = await client.protected.items.$get();
      if (!res.ok) {
        throw new Error(`items ${res.status}`);
      }
      const body = await res.json();
      return body.data;
    },
  });
}

type CreateItemInput = InferRequestType<
  (typeof client.protected.items)["$post"]
>["json"];

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateItemInput) => {
      const res = await client.protected.items.$post({ json: input });
      if (!res.ok) {
        throw new Error(`create item ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemsKey() });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.protected.items[":id"].$delete({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? "That item is on an invoice and cannot be deleted."
            : `delete item ${res.status}`
        );
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemsKey() });
    },
  });
}
