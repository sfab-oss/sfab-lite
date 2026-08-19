import type { InvoiceStatus } from "../contract/invoices";

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "paid",
] as const satisfies readonly InvoiceStatus[];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
};
