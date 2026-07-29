/** Explicit AppDO stub surface — DO Rpc generics erase method returns under tsc alone. */
export interface AppStub {
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

export function appStub(env: Env, appId: string): AppStub {
  return env.APP_DO.get(env.APP_DO.idFromName(appId)) as unknown as AppStub;
}
