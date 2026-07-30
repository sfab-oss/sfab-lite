import type { AppRecord } from "../registry/app-registry.js";

export interface WireApp {
  id: string;
  organizationId: string;
  name: string;
  status: "creating" | "ready" | "failed";
  createAttemptId: string | null;
  liveSha: string | null;
  createdAt: string;
  updatedAt: string;
}

export function wireApp(record: AppRecord): WireApp {
  return {
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    status: record.status,
    createAttemptId: record.createAttemptId,
    liveSha: record.liveSha,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
