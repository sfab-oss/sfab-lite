import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { client } from "../lib/client";

const getProductsKey = () => ["products"] as const;

export function useProducts() {
  return useQuery({
    queryKey: getProductsKey(),
    queryFn: async () => {
      const res = await client.protected.products.$get();
      if (!res.ok) {
        throw new Error(`products ${res.status}`);
      }
      const body = await res.json();
      return body.data;
    },
  });
}

type CreateProductInput = InferRequestType<
  (typeof client.protected.products)["$post"]
>["json"];

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProductInput) => {
      const res = await client.protected.products.$post({ json: input });
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? "That SKU is already in the catalog."
            : `create product ${res.status}`
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
        throw new Error(`delete product ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getProductsKey() });
    },
  });
}
