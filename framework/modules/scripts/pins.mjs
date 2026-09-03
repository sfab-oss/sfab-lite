/**
 * Closed catalog-module allowlist. Each pin has a committed artifact under
 * framework/modules/<name>@<version>/. Pin builders write that tree only;
 * assemble-catalog.mjs unions them into catalog-modules.json.
 */
export const ESBUILD_PIN = "0.28.1";

export const CATALOG_PINS = [
  {
    name: "pdf-lib",
    version: "1.17.1",
    loaderKey: "pdf-lib.js",
    esmFile: "pdf-lib.esm.js",
    stubVfsPath: "/node_modules/pdf-lib/index.d.ts",
    reexportDefault: false,
  },
  {
    name: "exceljs",
    version: "4.4.0",
    loaderKey: "exceljs.js",
    esmFile: "exceljs.esm.js",
    stubVfsPath: "/node_modules/exceljs/index.d.ts",
    reexportDefault: true,
  },
];

export function pinSpec(pin) {
  return `${pin.name}@${pin.version}`;
}

export function findPin(spec) {
  return CATALOG_PINS.find((pin) => pinSpec(pin) === spec);
}
