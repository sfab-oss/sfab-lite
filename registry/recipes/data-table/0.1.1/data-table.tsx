import {
  CaretDownIcon,
  CaretSortIcon,
  CaretUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";
import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Input } from "./input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterPlaceholder?: string;
  pageSize?: number;
}

function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  const sorted = column.getIsSorted();
  let SortIcon = CaretSortIcon;
  if (sorted === "desc") {
    SortIcon = CaretDownIcon;
  } else if (sorted === "asc") {
    SortIcon = CaretUpIcon;
  }

  return (
    <Button
      className={cn("-ml-2 h-8 data-[state=open]:bg-accent", className)}
      onClick={() => column.toggleSorting(sorted === "asc")}
      size="sm"
      variant="ghost"
    >
      <span>{title}</span>
      <SortIcon className="size-3.5" />
    </Button>
  );
}

function DataTable<TData, TValue>({
  columns,
  data,
  filterValue,
  onFilterChange,
  filterPlaceholder = "Filter…",
  pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [internalFilter, setInternalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const globalFilter = onFilterChange ? (filterValue ?? "") : internalFilter;

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: onFilterChange
      ? (updater) => {
          const next =
            typeof updater === "function" ? updater(globalFilter) : updater;
          onFilterChange(String(next ?? ""));
        }
      : setInternalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2 px-1 pt-1">
        <Input
          className="max-w-sm"
          onChange={(event) => {
            const value = event.target.value;
            if (onFilterChange) {
              onFilterChange(value);
            } else {
              setInternalFilter(value);
            }
            table.setPageIndex(0);
          }}
          placeholder={filterPlaceholder}
          value={globalFilter}
        />
        <span className="text-muted-foreground text-xs tabular-nums">
          {filteredCount} of {data.length}
        </span>
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={columns.length}>
                {data.length === 0
                  ? "No results."
                  : "No rows match the filter."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <span className="text-muted-foreground text-xs tabular-nums">
          Page {pageCount === 0 ? 0 : pageIndex + 1} of {pageCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            aria-label="Next page"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export { DataTable, DataTableColumnHeader };
