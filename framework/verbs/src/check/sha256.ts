/// <reference path="../node-stdlib.d.ts" />
import { createHash } from "node:crypto";

export function sha256Utf8Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
