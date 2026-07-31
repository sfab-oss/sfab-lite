/**
 * AppDataDO idFromName keys — one data DO class, many serve targets.
 *
 * Workspace WIP serve is keyed by workspaceId (`ws_…:ws`).
 *
 * Re-exports the canonical helpers from serve-target so call sites that only
 * need ids keep importing this module.
 */

export {
  liveDataId,
  prDataId,
  wsDataId,
} from "./serve-target.js";
