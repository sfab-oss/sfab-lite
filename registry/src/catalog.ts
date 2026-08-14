import catalogJson from "./generated/catalog.json" with { type: "json" };
import type { Catalog } from "./types.js";

export const CATALOG: Catalog = catalogJson as Catalog;
