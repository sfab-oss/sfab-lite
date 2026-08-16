import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const verbsSrc = join(here, "../../../framework/verbs/src");

export const VERBS_BUNDLE_FLAGS = [
  "--packages=external",
  `--alias:@sfab-lite/verbs=${verbsSrc}`,
];
