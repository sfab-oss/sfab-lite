type MockFileEntryType = "directory" | "file";

export interface MockFileEntry {
  name: string;
  path: string;
  type: MockFileEntryType;
}

type MockFileEncoding = "binary" | "text" | "too-large";

export interface MockFileContent {
  content: string;
  encoding: MockFileEncoding;
  mimeType: string;
  size: number;
}

const EMPTY_DIR: MockFileEntry[] = [];

const DIRS: Record<string, MockFileEntry[]> = {
  "": [
    { name: "package.json", path: "package.json", type: "file" },
    { name: "src", path: "src", type: "directory" },
    { name: "assets", path: "assets", type: "directory" },
  ],
  src: [
    { name: "features", path: "src/features", type: "directory" },
    { name: "lib", path: "src/lib", type: "directory" },
  ],
  "src/features": [
    { name: "invoices", path: "src/features/invoices", type: "directory" },
  ],
  "src/features/invoices": [
    {
      name: "invoice-table.tsx",
      path: "src/features/invoices/invoice-table.tsx",
      type: "file",
    },
    {
      name: "invoice-filters.ts",
      path: "src/features/invoices/invoice-filters.ts",
      type: "file",
    },
    {
      name: "use-invoices.ts",
      path: "src/features/invoices/use-invoices.ts",
      type: "file",
    },
    { name: "lib", path: "src/features/invoices/lib", type: "directory" },
    {
      name: "__tests__",
      path: "src/features/invoices/__tests__",
      type: "directory",
    },
  ],
  "src/features/invoices/lib": [
    {
      name: "export-invoices-csv.ts",
      path: "src/features/invoices/lib/export-invoices-csv.ts",
      type: "file",
    },
  ],
  "src/features/invoices/__tests__": [
    {
      name: "export.test.ts",
      path: "src/features/invoices/__tests__/export.test.ts",
      type: "file",
    },
    {
      name: "filters.test.ts",
      path: "src/features/invoices/__tests__/filters.test.ts",
      type: "file",
    },
  ],
  "src/lib": [{ name: "money.ts", path: "src/lib/money.ts", type: "file" }],
  assets: [{ name: "logo.png", path: "assets/logo.png", type: "file" }],
};

const FILE_BODIES: Record<string, MockFileContent> = {
  "package.json": {
    encoding: "text",
    mimeType: "application/json",
    size: 312,
    content: `{
  "name": "@acme/billing",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
`,
  },
  "src/features/invoices/invoice-table.tsx": {
    encoding: "text",
    mimeType: "text/typescript",
    size: 680,
    content: `import { useInvoices } from "./use-invoices";
import { exportInvoicesCsv } from "./lib/export-invoices-csv";

export function InvoiceTable() {
  const { rows, filters } = useInvoices();

  return (
    <div>
      <button
        onClick={() => exportInvoicesCsv(filters, rows)}
        type="button"
      >
        Export CSV
      </button>
      {/* table body uses the same filters object */}
    </div>
  );
}
`,
  },
  "src/features/invoices/invoice-filters.ts": {
    encoding: "text",
    mimeType: "text/typescript",
    size: 240,
    content: `export type InvoiceStatus = "open" | "paid" | "voided" | "all";

export interface InvoiceFilters {
  status: InvoiceStatus;
  query: string;
}
`,
  },
  "src/features/invoices/use-invoices.ts": {
    encoding: "text",
    mimeType: "text/typescript",
    size: 410,
    content: `import type { InvoiceFilters } from "./invoice-filters";

export function useInvoices() {
  // Derived from the URL once — export must take this object, not re-parse.
  const filters: InvoiceFilters = { status: "open", query: "" };
  return { filters, rows: [] as { id: string }[] };
}
`,
  },
  "src/features/invoices/lib/export-invoices-csv.ts": {
    encoding: "text",
    mimeType: "text/typescript",
    size: 920,
    content: `import type { InvoiceFilters } from "../invoice-filters";

const INVOICE_COLUMNS = ["id", "customer", "total", "status"] as const;

export function exportInvoicesCsv(
  filters: InvoiceFilters,
  rows: { id: string; customer: string; total: number; status: string }[]
) {
  const filtered =
    filters.status === "all"
      ? rows
      : rows.filter((row) => row.status === filters.status);

  const header = INVOICE_COLUMNS.join(",");
  const body = filtered
    .map((row) => INVOICE_COLUMNS.map((col) => row[col]).join(","))
    .join("\\n");

  return \`\${header}\\n\${body}\\n\`;
}
`,
  },
  "src/features/invoices/__tests__/export.test.ts": {
    encoding: "text",
    mimeType: "text/typescript",
    size: 280,
    content: `import { describe, expect, it } from "vitest";
import { exportInvoicesCsv } from "../lib/export-invoices-csv";

describe("exportInvoicesCsv", () => {
  it("omits voided rows when status=open", () => {
    expect(true).toBe(true);
  });
});
`,
  },
  "src/features/invoices/__tests__/filters.test.ts": {
    encoding: "text",
    mimeType: "text/typescript",
    size: 160,
    content: `import { describe, it } from "vitest";

describe("invoice filters", () => {
  it("parses status from the URL", () => {});
});
`,
  },
  "src/lib/money.ts": {
    encoding: "text",
    mimeType: "text/typescript",
    size: 190,
    content: `export type MinorUnits = number & { readonly __brand: "MinorUnits" };

export function toMinor(amount: number): MinorUnits {
  return Math.round(amount * 100) as MinorUnits;
}
`,
  },
  "assets/logo.png": {
    encoding: "binary",
    mimeType: "image/png",
    size: 48_120,
    content: "",
  },
};

export function getMockDir(path: string): {
  entries: MockFileEntry[];
  path: string;
} {
  return { path, entries: DIRS[path] ?? EMPTY_DIR };
}

export function getMockFile(path: string): MockFileContent | null {
  return FILE_BODIES[path] ?? null;
}
