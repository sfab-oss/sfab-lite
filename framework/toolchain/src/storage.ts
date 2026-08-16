export interface StoragePutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface StorageObject {
  body: ReadableStream;
  size: number;
  etag: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface StorageHead {
  size: number;
  etag: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface StorageListItem {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
}

export interface StorageListResult {
  objects: StorageListItem[];
  cursor?: string;
  truncated: boolean;
}

export interface Storage {
  put: (
    key: string,
    body: ReadableStream | ArrayBuffer | string,
    options?: StoragePutOptions
  ) => Promise<void>;
  get: (key: string) => Promise<StorageObject | null>;
  head: (key: string) => Promise<StorageHead | null>;
  delete: (key: string | string[]) => Promise<void>;
  list: (options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }) => Promise<StorageListResult>;
}
