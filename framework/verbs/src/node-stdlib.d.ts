declare module "node:crypto" {
  export function createHash(algorithm: string): {
    update: (
      data: string,
      encoding: string
    ) => {
      digest: (encoding: string) => string;
    };
  };
}

declare module "node:path" {
  export const posix: {
    normalize: (path: string) => string;
    join: (...paths: string[]) => string;
  };
}
