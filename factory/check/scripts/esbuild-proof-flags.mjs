import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const verbsSrc = join(here, "../../../framework/verbs/src");
const toolchainPkg = join(repoRoot, "framework/toolchain/package.json");
const zodRoot = dirname(
  createRequire(toolchainPkg).resolve("zod/package.json")
);

export const VERBS_BUNDLE_FLAGS = [
  "--packages=external",
  `--alias:@sfab-lite/verbs=${verbsSrc}`,
  `--alias:zod=${zodRoot}`,
];
