import ExcelJS from "exceljs";

export interface WorkbookRow {
  values: (string | number)[];
}

export interface WorkbookInput {
  sheetName: string;
  headers: string[];
  rows: WorkbookRow[];
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function asArrayBufferBytes(
  bytes: ArrayBuffer | Uint8Array
): Uint8Array<ArrayBuffer> {
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes);
  }
  const out = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  out.set(bytes);
  return out;
}

export async function renderWorkbook(
  input: WorkbookInput
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(input.sheetName);
  sheet.addRow(input.headers);
  for (const row of input.rows) {
    sheet.addRow(row.values);
  }
  return asArrayBufferBytes(await workbook.xlsx.writeBuffer());
}
