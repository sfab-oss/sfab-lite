import { Cross2Icon, MixerHorizontalIcon } from "@radix-ui/react-icons";
import type { ColumnFiltersState } from "@tanstack/react-table";
import { useMemo } from "react";
import {
  countActiveFilters,
  formatFilterChipValue,
  getColumnFilterValue,
  isFilterValueActive,
  setColumnFilterValue,
  type TableFilterDefinition,
} from "../../lib/table-filter-types";
import { cn } from "../../lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Separator } from "./separator";
import { type TableSort, TableSortControl } from "./table-sort-control";

function FilterChip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <Badge className="h-7 max-w-xs gap-1 pr-1 font-normal" variant="secondary">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate">{value}</span>
      <button
        aria-label={`Remove ${label} filter`}
        className="ml-0.5 shrink-0 rounded-sm p-0.5 hover:bg-background/80"
        onClick={onRemove}
        type="button"
      >
        <Cross2Icon className="size-3" />
      </button>
    </Badge>
  );
}

function EnumFilterSection({
  definition,
  selected,
  onChange,
}: {
  definition: Extract<TableFilterDefinition, { type: "enum" }>;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  function toggle(value: string, checked: boolean) {
    if (checked) {
      onChange([...selected, value]);
      return;
    }
    onChange(selected.filter((item) => item !== value));
  }

  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">{definition.label}</p>
      <div className="grid gap-2">
        {definition.options.map((option) => {
          const checked = selected.includes(option.value);
          const optionId = `${definition.id}-${option.value}`;
          return (
            <div className="flex items-center gap-2" key={option.value}>
              <Checkbox
                checked={checked}
                id={optionId}
                onCheckedChange={(next) => toggle(option.value, next === true)}
              />
              <Label className="font-normal text-sm" htmlFor={optionId}>
                {option.label}
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextFilterSection({
  definition,
  value,
  onChange,
}: {
  definition: Extract<TableFilterDefinition, { type: "text" }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="font-medium text-sm" htmlFor={definition.id}>
        {definition.label}
      </Label>
      <Input
        id={definition.id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          definition.placeholder ??
          `Filter by ${definition.label.toLowerCase()}…`
        }
        value={value}
      />
    </div>
  );
}

function TableFilterToolbar({
  definitions,
  columnFilters,
  onColumnFiltersChange,
  filteredCount,
  totalCount,
  className,
  sort,
}: {
  className?: string;
  columnFilters: ColumnFiltersState;
  definitions: TableFilterDefinition[];
  filteredCount: number;
  onColumnFiltersChange: (
    filters:
      | ColumnFiltersState
      | ((old: ColumnFiltersState) => ColumnFiltersState)
  ) => void;
  sort?: TableSort;
  totalCount: number;
}) {
  const activeCount = countActiveFilters(columnFilters, definitions);
  const activeChips = useMemo(
    () =>
      definitions.flatMap((definition) => {
        const value = getColumnFilterValue(columnFilters, definition.columnId);
        if (!isFilterValueActive(value)) {
          return [];
        }
        return [
          {
            columnId: definition.columnId,
            label: definition.label,
            displayValue: formatFilterChipValue(definition, value),
          },
        ];
      }),
    [columnFilters, definitions]
  );

  function updateFilter(columnId: string, value: unknown) {
    onColumnFiltersChange(setColumnFilterValue(columnFilters, columnId, value));
  }

  function clearAll() {
    onColumnFiltersChange([]);
  }

  const showSortControl = sort !== undefined && sort.columns.length > 0;
  const showFilters = definitions.length > 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2",
        className
      )}
      data-slot="table-filter-toolbar"
    >
      {showSortControl ? <TableSortControl sort={sort} /> : null}

      {showFilters ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                aria-label={
                  activeCount > 0
                    ? `Filters (${activeCount} active)`
                    : "Filters"
                }
                className="relative shrink-0"
                size="icon-xs"
                variant="outline"
              />
            }
          >
            <MixerHorizontalIcon />
            {activeCount > 0 ? (
              <Badge
                className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] leading-none"
                variant="secondary"
              >
                {activeCount}
              </Badge>
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 gap-0 p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="font-medium text-sm">Filters</p>
              {activeCount > 0 ? (
                <Button
                  className="h-auto px-0 text-muted-foreground text-xs"
                  onClick={clearAll}
                  type="button"
                  variant="link"
                >
                  Clear all
                </Button>
              ) : null}
            </div>
            <Separator />
            <div className="max-h-[min(24rem,60vh)] space-y-4 overflow-y-auto p-4">
              {definitions.map((definition, index) => (
                <div key={definition.id}>
                  {index > 0 ? <Separator className="mb-4" /> : null}
                  {definition.type === "text" ? (
                    <TextFilterSection
                      definition={definition}
                      onChange={(value) =>
                        updateFilter(definition.columnId, value)
                      }
                      value={
                        (getColumnFilterValue(
                          columnFilters,
                          definition.columnId
                        ) as string | undefined) ?? ""
                      }
                    />
                  ) : (
                    <EnumFilterSection
                      definition={definition}
                      onChange={(values) =>
                        updateFilter(definition.columnId, values)
                      }
                      selected={
                        (getColumnFilterValue(
                          columnFilters,
                          definition.columnId
                        ) as string[] | undefined) ?? []
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      {activeChips.map((chip) => (
        <FilterChip
          key={chip.columnId}
          label={chip.label}
          onRemove={() => updateFilter(chip.columnId, undefined)}
          value={chip.displayValue}
        />
      ))}

      {activeCount > 0 ? (
        <Button
          className="h-7 px-2 text-muted-foreground text-xs"
          onClick={clearAll}
          size="sm"
          type="button"
          variant="ghost"
        >
          Clear all
        </Button>
      ) : null}

      <span className="ml-auto text-muted-foreground text-xs tabular-nums">
        {filteredCount === totalCount
          ? `${totalCount} ${totalCount === 1 ? "row" : "rows"}`
          : `${filteredCount} of ${totalCount}`}
      </span>
    </div>
  );
}

export { TableFilterToolbar };
