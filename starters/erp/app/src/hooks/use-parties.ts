import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { client } from "../lib/client";

const partiesKey = () => ["parties"] as const;
const partyKey = (id: string) => ["parties", id] as const;
const balancesKey = () => ["balances"] as const;

export function useParties() {
  return useQuery({
    queryKey: partiesKey(),
    queryFn: async () => {
      const res = await client.protected.parties.$get();
      if (!res.ok) {
        throw new Error(`parties ${res.status}`);
      }
      const body = await res.json();
      return body.data;
    },
  });
}

export function useParty(id: string) {
  return useQuery({
    queryKey: partyKey(id),
    queryFn: async () => {
      const res = await client.protected.parties[":id"].$get({ param: { id } });
      if (!res.ok) {
        throw new Error(`party ${res.status}`);
      }
      return await res.json();
    },
  });
}

export function useOpenBalances() {
  return useQuery({
    queryKey: balancesKey(),
    queryFn: async () => {
      const res = await client.protected.balances.$get();
      if (!res.ok) {
        throw new Error(`balances ${res.status}`);
      }
      const body = await res.json();
      return body.data;
    },
  });
}

type CreatePartyInput = InferRequestType<
  (typeof client.protected.parties)["$post"]
>["json"];

export function useCreateParty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePartyInput) => {
      const res = await client.protected.parties.$post({ json: input });
      if (!res.ok) {
        throw new Error(`create party ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partiesKey() });
      queryClient.invalidateQueries({ queryKey: balancesKey() });
    },
  });
}

export function useDeleteParty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.protected.parties[":id"].$delete({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? "That party has ledger entries and cannot be deleted."
            : `delete party ${res.status}`
        );
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partiesKey() });
      queryClient.invalidateQueries({ queryKey: balancesKey() });
    },
  });
}

type LedgerInput = InferRequestType<
  (typeof client.protected.parties)[":id"]["charges"]["$post"]
>["json"];

export function useAddCharge(partyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LedgerInput) => {
      const res = await client.protected.parties[":id"].charges.$post({
        param: { id: partyId },
        json: input,
      });
      if (!res.ok) {
        throw new Error(`charge ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partyKey(partyId) });
      queryClient.invalidateQueries({ queryKey: partiesKey() });
      queryClient.invalidateQueries({ queryKey: balancesKey() });
    },
  });
}

export function useAddPayment(partyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LedgerInput) => {
      const res = await client.protected.parties[":id"].payments.$post({
        param: { id: partyId },
        json: input,
      });
      if (!res.ok) {
        throw new Error(`payment ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partyKey(partyId) });
      queryClient.invalidateQueries({ queryKey: partiesKey() });
      queryClient.invalidateQueries({ queryKey: balancesKey() });
    },
  });
}
