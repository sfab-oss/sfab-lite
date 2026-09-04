/**
 * Declared cheap-vs-real signature seams for exceljs@4.4.0.
 * `check:catalog-agreement` fails if a surface/real mismatch has no why.
 *
 * addRow(123) is a cheap-only plant: real exceljs types the argument as any.
 */
export const SEAMS = [
  {
    name: "Worksheet.columns",
    why: "Real columns is Partial<Column>[] and Column.header is string | string[]. Cheap L2 is Column[] with header?: string because hosted recipes set a single header string. Do not copy Partial or string[] into the surface.",
  },
  {
    name: "Worksheet.addRow",
    why: "Real exceljs types addRow as any[] | any, so addRow(123) typechecks on the closure. Cheap L2 is (string | number)[] so a scalar is an error. Do not copy `any` into the surface.",
  },
  {
    name: "Worksheet.addRows",
    why: "Real addRows takes any[]. Cheap L2 is (string | number)[][] so a scalar is an error on both (real still rejects a non-array). Keep the cheap row-cell union, not any.",
  },
  {
    name: "xlsx.load",
    why: "Real xlsx.load takes Node Buffer. Cheap L2 takes Uint8Array because hosted apps have no Buffer. Do not overlay Node types on the surface.",
  },
];
