export type LiteItemType =
  | "registry:lib"
  | "registry:ui"
  | "registry:component"
  | "registry:block"
  | "registry:hook"
  | "registry:file";

export type LiteFileType =
  | "registry:lib"
  | "registry:ui"
  | "registry:component"
  | "registry:hook"
  | "registry:file";

export interface RecipeFile {
  path: string;
  type: LiteFileType;
  target: string;
}

export interface RecipeMeta {
  liteProfile: 1;
  liteRuntime: string;
  liteBoundary?: string;
}

export interface RecipeItem {
  name: string;
  type: LiteItemType;
  title: string;
  description: string;
  registryDependencies: string[];
  dependencies?: string[];
  files: RecipeFile[];
  meta: RecipeMeta;
}

export interface CatalogEntry {
  version: string;
  item: RecipeItem;
  contents: Record<string, string>;
}

export interface Catalog {
  schemaPin: {
    url: string;
    fetched: string;
    sha256: string;
    vendoredPath: string;
  };
  items: Record<string, CatalogEntry>;
}

export interface Issue {
  path: string;
  message: string;
}

export type ItemValidation =
  | { ok: true; item: RecipeItem }
  | { ok: false; issues: Issue[] };
