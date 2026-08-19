import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretSortIcon,
} from "@radix-ui/react-icons";
import type { Column, RowData } from "@tanstack/react-table";
import { cn } from "../../lib/utils";
import { Button } from "./button";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
  }
}

export type SortDirection = false | "asc" | "desc";

export function sortAriaLabel(label: string, sorted: SortDirection): string {
  if (sorted === "asc") {
    return `Sorted by ${label}, ascending. Click to sort descending.`;
  }
  if (sorted === "desc") {
    return `Sorted by ${label}, descending. Click to sort ascending.`;
  }
  return `Sort by ${label}`;
}

export function sortAriaSort(
  sorted: SortDirection
): "ascending" | "descending" | undefined {
  if (sorted === "asc") {
    return "ascending";
  }
  if (sorted === "desc") {
    return "descending";
  }
}

export function SortIcon({
  sorted,
  className,
}: {
  sorted: SortDirection;
  className?: string;
}) {
  if (sorted === "asc") {
    return <ArrowUpIcon className={cn("size-4", className)} />;
  }
  if (sorted === "desc") {
    return <ArrowDownIcon className={cn("size-4", className)} />;
  }
  return (
    <CaretSortIcon
      className={cn("size-4 text-muted-foreground opacity-50", className)}
    />
  );
}

function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title?: string;
  className?: string;
}) {
  const label = title ?? column.columnDef.meta?.label ?? column.id;
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{label}</div>;
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      aria-label={sortAriaLabel(label, sorted)}
      className={cn(
        "-ml-2 h-8 px-2 font-medium",
        sorted && "text-foreground",
        className
      )}
      onClick={() => column.toggleSorting(sorted === "asc")}
      size="sm"
      variant="ghost"
    >
      <span>{label}</span>
      <SortIcon sorted={sorted} />
    </Button>
  );
}

export { DataTableColumnHeader };
