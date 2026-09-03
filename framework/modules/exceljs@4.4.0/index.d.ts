interface Worksheet {
  addRow(values: unknown[]): unknown;
}

interface Workbook {
  addWorksheet(name: string): Worksheet;
  readonly xlsx: {
    writeBuffer(): Promise<ArrayBuffer | Uint8Array>;
  };
}

declare const ExcelJS: {
  Workbook: {
    new (): Workbook;
  };
};

export default ExcelJS;
