export interface RGB {
  type: "RGB";
  red: number;
  green: number;
  blue: number;
}

export function rgb(red: number, green: number, blue: number): RGB;

export const StandardFonts: {
  readonly Courier: string;
  readonly CourierBold: string;
  readonly Helvetica: string;
  readonly HelveticaBold: string;
  readonly TimesRoman: string;
  readonly TimesRomanBold: string;
};

export class PDFFont {
  readonly name: string;
  widthOfTextAtSize(text: string, size: number): number;
}

export class PDFImage {
  readonly width: number;
  readonly height: number;
  scale(factor: number): { width: number; height: number };
}

export class PDFPage {
  getSize(): { width: number; height: number };
  drawText(
    text: string,
    options: {
      x: number;
      y: number;
      size: number;
      font: PDFFont;
      color?: RGB;
    }
  ): void;
  drawImage(
    image: PDFImage,
    options: {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  ): void;
}

export class PDFDocument {
  static create(): Promise<PDFDocument>;
  static load(pdf: Uint8Array): Promise<PDFDocument>;
  addPage(size?: [number, number]): PDFPage;
  embedFont(font: string): Promise<PDFFont>;
  embedPng(png: Uint8Array): Promise<PDFImage>;
  copyPages(srcDoc: PDFDocument, indices: number[]): Promise<PDFPage[]>;
  setTitle(title: string): void;
  save(): Promise<Uint8Array<ArrayBuffer>>;
}
