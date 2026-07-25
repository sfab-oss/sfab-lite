/** Hand-written typings for generated types VFS (apps/check contract). */
export const TYPES_VFS: Record<string, string>;

export const TYPES_VFS_MANIFEST: {
  readonly typescript: string;
  readonly libEntry: string;
  readonly libFileCount: number;
  readonly packageTypeCounts: Readonly<Record<string, number>>;
  readonly vfsFileCount: number;
  readonly vfsRawBytes: number;
  readonly vfsJsonGzipBytes: number;
  readonly prune: {
    readonly mode: string;
    readonly templateRootCount: number;
    readonly nodeModulesFiles: number;
    readonly packages: readonly string[];
    readonly note: string;
    readonly fullPackageExceptions?: Readonly<
      Record<string, { readonly extraFiles: number; readonly note: string }>
    >;
  };
  readonly note: string;
};
