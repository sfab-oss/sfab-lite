import type {
  ObjectStore,
  ObjectStoreBody,
  ObjectStoreHead,
  ObjectStoreList,
  ObjectStoreListOptions,
  ObjectStorePutOptions,
  ObjectStorePutValue,
} from "../object-store.ts";

function toBytes(value: ObjectStorePutValue): Uint8Array {
  if (value == null) {
    return new Uint8Array();
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error("fake R2: unsupported put body");
}

function etagFor(bytes: Uint8Array): string {
  let hash = 0;
  for (const byte of bytes) {
    hash = (hash * 33 + byte) % 4_294_967_296;
  }
  return hash.toString(16).padStart(8, "0");
}

export class FakeR2Object implements ObjectStoreBody {
  readonly key: string;
  readonly size: number;
  readonly uploaded: Date;
  readonly etag: string;
  readonly httpMetadata?: ObjectStoreHead["httpMetadata"];
  readonly customMetadata?: Record<string, string>;
  readonly #bytes: Uint8Array;

  constructor(
    key: string,
    bytes: Uint8Array,
    uploaded: Date,
    etag: string,
    httpMetadata?: ObjectStoreHead["httpMetadata"],
    customMetadata?: Record<string, string>
  ) {
    this.key = key;
    this.size = bytes.byteLength;
    this.uploaded = uploaded;
    this.etag = etag;
    this.httpMetadata = httpMetadata;
    this.customMetadata = customMetadata;
    this.#bytes = bytes;
  }

  get body(): ReadableStream<Uint8Array> {
    const bytes = this.#bytes;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    const copy = new Uint8Array(this.#bytes.byteLength);
    copy.set(this.#bytes);
    return Promise.resolve(copy.buffer);
  }

  text(): Promise<string> {
    return Promise.resolve(new TextDecoder().decode(this.#bytes));
  }
}

interface Stored {
  bytes: Uint8Array;
  uploaded: Date;
  etag: string;
  httpMetadata?: R2HTTPMetadata | Headers;
  customMetadata?: Record<string, string>;
}

export type FakeR2PutOptions = ObjectStorePutOptions;

export class FakeR2Bucket implements ObjectStore {
  readonly puts: string[] = [];
  readonly listCalls: { prefix?: string; limit?: number }[] = [];
  readonly #store = new Map<string, Stored>();

  put(
    key: string,
    value: ObjectStorePutValue,
    options?: FakeR2PutOptions
  ): Promise<FakeR2Object> {
    const bytes = toBytes(value);
    const uploaded = new Date();
    const etag = etagFor(bytes);
    const stored: Stored = {
      bytes,
      uploaded,
      etag,
      httpMetadata: options?.httpMetadata,
      customMetadata: options?.customMetadata,
    };
    this.#store.set(key, stored);
    this.puts.push(key);
    return Promise.resolve(this.#object(key, stored));
  }

  get(key: string): Promise<FakeR2Object | null> {
    const stored = this.#store.get(key);
    if (!stored) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.#object(key, stored));
  }

  head(key: string): Promise<FakeR2Object | null> {
    return this.get(key);
  }

  delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      this.#store.delete(key);
    }
    return Promise.resolve();
  }

  list(options?: ObjectStoreListOptions): Promise<ObjectStoreList> {
    const prefix = options?.prefix ?? "";
    const delimiter = options?.delimiter;
    const limit = options?.limit ?? 1000;
    this.listCalls.push({ prefix: options?.prefix, limit: options?.limit });
    const startAfter = options?.cursor ?? options?.startAfter;
    const keys = [...this.#store.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort((a, b) => a.localeCompare(b));
    const after = startAfter ? keys.filter((k) => k > startAfter) : keys;

    const objects: ObjectStoreHead[] = [];
    const prefixes = new Set<string>();
    let lastKey: string | undefined;

    for (const key of after) {
      if (objects.length + prefixes.size >= limit) {
        return Promise.resolve({
          objects,
          delimitedPrefixes: [...prefixes].sort(),
          truncated: true,
          cursor: lastKey,
        });
      }
      const rest = key.slice(prefix.length);
      if (delimiter) {
        const cut = rest.indexOf(delimiter);
        if (cut !== -1) {
          prefixes.add(`${prefix}${rest.slice(0, cut + delimiter.length)}`);
          lastKey = key;
          continue;
        }
      }
      const stored = this.#store.get(key);
      if (stored) {
        objects.push(this.#object(key, stored));
        lastKey = key;
      }
    }

    return Promise.resolve({
      objects,
      delimitedPrefixes: [...prefixes].sort(),
      truncated: false,
    });
  }

  keys(): string[] {
    return [...this.#store.keys()].sort();
  }

  #object(key: string, stored: Stored): FakeR2Object {
    return new FakeR2Object(
      key,
      stored.bytes,
      stored.uploaded,
      stored.etag,
      stored.httpMetadata,
      stored.customMetadata
    );
  }
}
