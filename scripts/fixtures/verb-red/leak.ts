import { VERBS_BUNDLE_FLAGS } from "../../../factory/check/scripts/esbuild-proof-flags.mjs";

if (VERBS_BUNDLE_FLAGS.length === 0) {
  throw new Error("expected factory runner flags");
}
