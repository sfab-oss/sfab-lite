import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { client } from "../lib/client";

const invoicesKey = () => ["invoices"] as const;
const invoiceKey = (id: string) => ["invoices", id] as const;

export function useInvoices() {
  return useQuery({
    queryKey: invoicesKey(),
    queryFn: async () => {
      const res = await client.protected.invoices.$get();
      if (!res.ok) {
        throw new Error(`invoices ${res.status}`);
      }
      const body = await res.json();
      return body.data;
    },
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoiceKey(id),
    queryFn: async () => {
      const res = await client.protected.invoices[":id"].$get({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(`invoice ${res.status}`);
      }
      return await res.json();
    },
  });
}

type CreateInvoiceInput = InferRequestType<
  (typeof client.protected.invoices)["$post"]
>["json"];

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const res = await client.protected.invoices.$post({ json: input });
      if (!res.ok) {
        throw new Error(`create invoice ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoicesKey() });
    },
  });
}

type UpdateInvoiceInput = InferRequestType<
  (typeof client.protected.invoices)[":id"]["$patch"]
>["json"];

export function useUpdateInvoice(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateInvoiceInput) => {
      const res = await client.protected.invoices[":id"].$patch({
        param: { id: invoiceId },
        json: input,
      });
      if (!res.ok) {
        throw new Error(`update invoice ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKey(invoiceId) });
      queryClient.invalidateQueries({ queryKey: invoicesKey() });
    },
  });
}

type AddLineInput = InferRequestType<
  (typeof client.protected.invoices)[":id"]["lines"]["$post"]
>["json"];

export function useAddInvoiceLine(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddLineInput) => {
      const res = await client.protected.invoices[":id"].lines.$post({
        param: { id: invoiceId },
        json: input,
      });
      if (!res.ok) {
        throw new Error(`add line ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKey(invoiceId) });
      queryClient.invalidateQueries({ queryKey: invoicesKey() });
    },
  });
}
