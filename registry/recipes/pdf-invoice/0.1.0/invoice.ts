import { PDFDocument, StandardFonts } from "pdf-lib";

export interface InvoiceLine {
  description: string;
  amountCents: number;
}

export interface InvoiceInput {
  number: string;
  partyName: string;
  lines: InvoiceLine[];
}

export const PDF_CONTENT_TYPE = "application/pdf";

function formatCents(amountCents: number): string {
  const sign = amountCents < 0 ? "-" : "";
  const abs = Math.abs(amountCents);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}${dollars}.${String(cents).padStart(2, "0")}`;
}

export async function renderInvoicePdf(
  input: InvoiceInput
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();
  let y = height - 72;
  page.drawText(`Invoice ${input.number}`, { x: 72, y, size: 18, font });
  y -= 28;
  page.drawText(input.partyName, { x: 72, y, size: 12, font });
  y -= 36;
  let total = 0;
  for (const line of input.lines) {
    page.drawText(line.description, { x: 72, y, size: 11, font });
    page.drawText(formatCents(line.amountCents), {
      x: 420,
      y,
      size: 11,
      font,
    });
    total += line.amountCents;
    y -= 18;
  }
  y -= 12;
  page.drawText(`Total ${formatCents(total)}`, { x: 72, y, size: 12, font });
  return doc.save();
}
