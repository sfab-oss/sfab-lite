/**
 * Declared cheap-vs-real signature seams for pdf-lib@1.17.1.
 * `check:catalog-agreement` fails if a surface/real mismatch has no why.
 *
 * Method-parameter bivariance can hide a widened parameter; plants are the
 * backstop. Do not "fix" save() by overlaying real types on hosted check.
 */
export const SEAMS = [
  {
    name: "PDFDocument.save",
    why: "save() is Promise<Uint8Array<ArrayBuffer>> because hosted Response / BodyInit (#177) requires ArrayBuffer; real pdf-lib returns Uint8Array (ArrayBufferLike). Eject copies bytes. Do not overlay real types on hosted check.",
  },
  {
    name: "PDFFont",
    why: "Cheap PDFFont is a curated subset (name, widthOfTextAtSize). Real PDFFont is a class with ref/doc/embedder; construct-signature assignability of PDFPage.drawText then rejects stub options.font. Do not copy the real class into the cheap surface.",
  },
  {
    name: "PDFPage.drawText",
    why: "Stub drawText requires options.font: PDFFont (the subset above). Real options.font is the full class, so `const s: Surface = real` fails on PDFPage even though plants catch drawText(123). Method bivariance does not hide construct-signature return types.",
  },
  {
    name: "PDFImage",
    why: "Cheap PDFImage is width/height/scale. Real PDFImage is a class with ref/doc/embedder. Same construct-signature issue as PDFFont when drawImage options.image is compared.",
  },
  {
    name: "RGB",
    why: 'Cheap RGB is a closed { type: "RGB", red, green, blue } literal. Real RGB uses ColorTypes.RGB enum. Do not import the enum graph into the surface.',
  },
];
