/** Explicit DO stub surfaces — DO Rpc generics erase method returns under tsc alone. */

import { liveDataId } from "./app-data-ids.js";
import { dataIdForTarget, type ServeTarget } from "./serve-target.js";

interface AppDataSqlStmt {
  bind: (...values: unknown[]) => AppDataSqlStmt;
  all: () => Promise<{
    success: true;
    results: Record<string, unknown>[];
    meta: unknown;
  }>;
}

export interface AppDataStub {
  touch: () => Promise<{
    ok: true;
    appIdHint: string;
    appSchemaVersion: number;
    userCount: number | null;
  }>;
  bootstrap: (migrations: { id: string; sql: string }[]) => Promise<{
    ok: true;
    bootstrapped: boolean;
    appSchemaVersion: number;
    bootstrapMs: number;
  }>;
  seedCredentials: () => Promise<{ token: string; password: string }>;
  destroy: () => Promise<{ ok: true; bytesFreed: number }>;
  prepare: (query: string) => AppDataSqlStmt;
  pingScope: () => Promise<{
    dataId: string;
    ok: true;
    backend: "do-sqlite";
  }>;
}

export interface AppCreateStub {
  scheduleCreateRun: (jobId: string) => Promise<void>;
  destroy: () => Promise<{ ok: true; bytesFreed: number }>;
  getCreateJob: (jobId: string) => Promise<{
    ok: true;
    job: {
      id: string;
      status: "pending" | "pass" | "fail" | "error";
      createdAt: number;
      updatedAt: number;
      payload: unknown;
    } | null;
  }>;
  failCreateJob: (
    jobId: string,
    status: "fail" | "error",
    payload?: unknown
  ) => Promise<{ ok: true }>;
  completeCreateJob: (
    jobId: string,
    payload?: unknown
  ) => Promise<{ ok: true }>;
  startCreateJob: () => Promise<
    | { ok: true; jobId: string }
    | { ok: false; error: "job_in_flight"; jobId: string }
  >;
}

export function appDataStub(env: Env, dataId: string): AppDataStub {
  return env.APP_DATA_DO.get(
    env.APP_DATA_DO.idFromName(dataId)
  ) as unknown as AppDataStub;
}

export function liveAppDataStub(env: Env, appId: string): AppDataStub {
  return appDataStub(env, liveDataId(appId));
}

export function serveTargetAppDataStub(
  env: Env,
  target: ServeTarget
): AppDataStub {
  return appDataStub(env, dataIdForTarget(target));
}

export function appCreateStub(env: Env, appId: string): AppCreateStub {
  return env.APP_CREATE_DO.get(
    env.APP_CREATE_DO.idFromName(appId)
  ) as unknown as AppCreateStub;
}
