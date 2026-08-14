/**
 * Immutable build store — bundles keyed by appId + sha.
 *
 * Separate from CodeHost so Git remotes and build backends can diverge
 * (e.g. Cloudflare Artifacts vs R2) behind replaceable adapters.
 */

export interface AppBuild {
  sha: string;
  serverBundle: string;
  assets: Record<string, string>;
  kernelVersion: string;
  serverSurfaceHash: string | null;
}

export interface BuildStore {
  putBuild: (appId: string, build: AppBuild) => Promise<void>;
  getBuild: (appId: string, sha: string) => Promise<AppBuild | null>;
}
