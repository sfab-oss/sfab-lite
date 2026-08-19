import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import {
  type ColumnDef,
  type ColumnFiltersState,
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
import {
  arrIncludesExact,
  type TableFilterDefinition,
} from "../../lib/table-filter-types";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { sortAriaSort } from "./sortable-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { TableFilterToolbar } from "./table-filter-toolbar";
import { getSortableColumns } from "./table-sort-control";

const FILTER_TOOLBAR_TABLE_GUTTER =
  "[&_tr>*]:px-3 [&_tr>*:first-child]:pl-4 [&_tr>*:last-child]:pr-4";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  filterDefinitions?: TableFilterDefinition[];
  pageSize?: number;
}

function DataTable<TData, TValue>({
  columns,
  data,
  filterDefinitions = [],
  pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  function handleColumnFiltersChange(
    updater:
      | ColumnFiltersState
      | ((old: ColumnFiltersState) => ColumnFiltersState)
  ) {
    setColumnFilters(updater);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }

  const table = useReactTable({
    data,
    columns,
    filterFns: { arrIncludesExact },
    state: { sorting, columnFilters, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: handleColumnFiltersChange,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const rows = table.getRowModel().rows;
  const hasFilters = columnFilters.length > 0;
  const emptyMessage =
    data.length === 0 || !hasFilters
      ? "No results."
      : "No rows match your filters.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TableFilterToolbar
        columnFilters={columnFilters}
        definitions={filterDefinitions}
        filteredCount={filteredCount}
        onColumnFiltersChange={handleColumnFiltersChange}
        sort={{
          columns: getSortableColumns(table),
          onSortingChange: setSorting,
          sorting,
        }}
        totalCount={data.length}
      />
      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto",
          FILTER_TOOLBAR_TABLE_GUTTER
        )}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      aria-sort={sortAriaSort(sorted)}
                      className={cn(sorted && "bg-muted/40")}
                      key={header.id}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-muted-foreground"
                  colSpan={columns.length}
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3">
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

export type { TableFilterDefinition } from "../../lib/table-filter-types";
export { DataTableColumnHeader } from "./sortable-header";
export { DataTable };
