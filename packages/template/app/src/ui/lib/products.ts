import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

/** Calls into the catalog API. See `entities.ts` for the shape being followed. */
export const productsQueryOptions = queryOptions({
  queryKey: ["products"],
  queryFn: async () => {
    const res = await api.api.products.$get();
    if (!res.ok) {
      throw new Error(`products ${res.status}`);
    }
    const { products } = await res.json();
    return products;
  },
});

export async function createProduct(input: {
  sku: string;
  name: string;
  unitPriceCents: number;
}) {
  const res = await api.api.products.$post({ json: input });
  if (!res.ok) {
    throw new Error(
      res.status === 409
        ? "That SKU is already in the catalog."
        : `create product ${res.status}`
    );
  }
  return await res.json();
}

export async function deleteProduct(id: string) {
  const res = await api.api.products[":id"].$delete({ param: { id } });
  if (!res.ok) {
    throw new Error(`delete product ${res.status}`);
  }
  return await res.json();
}
