interface Font {
  name?: string;
  size?: number;
  bold?: boolean;
}

interface Cell {
  font: Font;
  value: string | number;
}

interface Column {
  header?: string;
  key?: string;
  width?: number;
}

interface Worksheet {
  columns: Column[];
  addRow: (values: (string | number)[]) => Cell;
  addRows: (rows: (string | number)[][]) => Cell[];
  getCell: (address: string) => Cell;
}

interface Workbook {
  addWorksheet: (name: string) => Worksheet;
  readonly xlsx: {
    writeBuffer: () => Promise<ArrayBuffer | Uint8Array>;
    load: (data: Uint8Array) => Promise<Workbook>;
  };
}

declare const ExcelJS: {
  Workbook: {
    new (): Workbook;
  };
};

export default ExcelJS;
