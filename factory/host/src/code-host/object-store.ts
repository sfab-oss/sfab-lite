export interface ObjectStoreHead {
  readonly key: string;
  readonly size: number;
  readonly etag: string;
  readonly uploaded: Date;
  readonly httpMetadata?: R2HTTPMetadata | Headers;
  readonly customMetadata?: Record<string, string>;
}

export interface ObjectStoreBody extends ObjectStoreHead {
  readonly body: ReadableStream;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
}

export interface ObjectStoreList {
  objects: ObjectStoreHead[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

export type ObjectStorePutOptions = R2PutOptions;

export interface ObjectStoreListOptions {
  prefix?: string;
  delimiter?: string;
  cursor?: string;
  limit?: number;
  startAfter?: string;
}

export type ObjectStorePutValue =
  | ReadableStream
  | ArrayBuffer
  | ArrayBufferView
  | string
  | null
  | Blob;

export interface ObjectStore {
  head: (key: string) => Promise<ObjectStoreHead | null>;
  get: (key: string) => Promise<ObjectStoreBody | null>;
  put: (
    key: string,
    value: ObjectStorePutValue,
    options?: ObjectStorePutOptions
  ) => Promise<ObjectStoreHead | null>;
  delete: (keys: string | string[]) => Promise<void>;
  list: (options?: ObjectStoreListOptions) => Promise<ObjectStoreList>;
}
