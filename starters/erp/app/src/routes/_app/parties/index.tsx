import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { ShellPageFrame } from "../../../components/layout/shell";
import { CreatePartyDialog } from "../../../components/parties/create-party-dialog";
import { Badge } from "../../../components/ui/badge";
import {
  DataTable,
  DataTableColumnHeader,
  type TableFilterDefinition,
} from "../../../components/ui/data-table";
import { EmptyState } from "../../../components/ui/empty-state";
import { Skeleton } from "../../../components/ui/skeleton";
import { useParties } from "../../../hooks/use-parties";
import { formatCents } from "../../../lib/money";
import { PARTY_KIND_LABEL, PARTY_KINDS } from "../../../lib/party-kind";

export const Route = createFileRoute("/_app/parties/")({
  component: PartiesPage,
});

interface PartyRow {
  id: string;
  name: string;
  kind: keyof typeof PARTY_KIND_LABEL;
  balanceCents: number;
}

const PARTY_FILTER_DEFINITIONS: TableFilterDefinition[] = [
  {
    id: "name",
    columnId: "name",
    label: "Name",
    type: "text",
    placeholder: "Search names…",
  },
  {
    id: "kind",
    columnId: "kind",
    label: "Kind",
    type: "enum",
    options: PARTY_KINDS.map((kind) => ({
      value: kind,
      label: PARTY_KIND_LABEL[kind],
    })),
  },
];

const columns: ColumnDef<PartyRow>[] = [
  {
    accessorKey: "name",
    meta: { label: "Name" },
    filterFn: "includesString",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <Link
        className="font-medium transition-colors hover:text-primary hover:underline"
        params={{ id: row.original.id }}
        to="/parties/$id"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "kind",
    meta: { label: "Kind" },
    filterFn: "arrIncludesExact",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Kind" />
    ),
    cell: ({ row }) => (
      <Badge variant="secondary">{PARTY_KIND_LABEL[row.original.kind]}</Badge>
    ),
  },
  {
    accessorKey: "balanceCents",
    meta: { label: "Balance" },
    header: ({ column }) => (
      <DataTableColumnHeader
        className="justify-end"
        column={column}
        title="Balance"
      />
    ),
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        {formatCents(row.original.balanceCents)}
      </div>
    ),
  },
];

function PartiesPage() {
  const parties = useParties();
  const rows = parties.data ?? [];
  const empty = !parties.isLoading && rows.length === 0;

  let body: ReactNode;
  if (parties.isLoading) {
    body = (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  } else if (empty) {
    body = (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          description="Create a customer or vendor to get started."
          title="No parties yet"
        />
      </div>
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        data={rows}
        filterDefinitions={PARTY_FILTER_DEFINITIONS}
      />
    );
  }

  return (
    <ShellPageFrame
      actions={<CreatePartyDialog />}
      items={[{ title: "Parties" }]}
    >
      {body}
    </ShellPageFrame>
  );
}
