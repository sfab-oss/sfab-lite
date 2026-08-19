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

export class PDFPage {
  getSize(): { width: number; height: number };
  drawText(
    text: string,
    options: {
      x: number;
      y: number;
      size: number;
      font: PDFFont;
    }
  ): void;
}

export class PDFDocument {
  static create(): Promise<PDFDocument>;
  addPage(size?: [number, number]): PDFPage;
  embedFont(font: string): Promise<PDFFont>;
  save(): Promise<Uint8Array>;
}
