import type { PartyKind } from "../contract/parties";

export const PARTY_KIND_LABEL: Record<PartyKind, string> = {
  customer: "Customer",
  vendor: "Vendor",
};

export const PARTY_KINDS = Object.keys(PARTY_KIND_LABEL) as PartyKind[];
