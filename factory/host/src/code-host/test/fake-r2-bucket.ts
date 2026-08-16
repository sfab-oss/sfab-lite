function toBytes(
  value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob
): Uint8Array {
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

class FakeR2Object {
  readonly key: string;
  readonly size: number;
  readonly uploaded: Date;
  readonly #bytes: Uint8Array;

  constructor(key: string, bytes: Uint8Array, uploaded: Date) {
    this.key = key;
    this.size = bytes.byteLength;
    this.uploaded = uploaded;
    this.#bytes = bytes;
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
}

export class FakeR2Bucket {
  readonly puts: string[] = [];
  readonly listCalls: { prefix?: string; limit?: number }[] = [];
  readonly #store = new Map<string, Stored>();

  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob
  ): Promise<FakeR2Object> {
    const bytes = toBytes(value);
    const uploaded = new Date();
    this.#store.set(key, { bytes, uploaded });
    this.puts.push(key);
    return Promise.resolve(new FakeR2Object(key, bytes, uploaded));
  }

  get(key: string): Promise<FakeR2Object | null> {
    const stored = this.#store.get(key);
    if (!stored) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      new FakeR2Object(key, stored.bytes, stored.uploaded)
    );
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

  list(options?: {
    prefix?: string;
    delimiter?: string;
    cursor?: string;
    limit?: number;
    startAfter?: string;
  }): Promise<{
    objects: FakeR2Object[];
    delimitedPrefixes: string[];
    truncated: boolean;
    cursor?: string;
  }> {
    const prefix = options?.prefix ?? "";
    const delimiter = options?.delimiter;
    const limit = options?.limit ?? 1000;
    this.listCalls.push({ prefix: options?.prefix, limit: options?.limit });
    const startAfter = options?.cursor ?? options?.startAfter;
    const keys = [...this.#store.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort((a, b) => a.localeCompare(b));
    const after = startAfter ? keys.filter((k) => k > startAfter) : keys;

    const objects: FakeR2Object[] = [];
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
        objects.push(new FakeR2Object(key, stored.bytes, stored.uploaded));
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
}
