import type { AppRecord } from "../registry.js";

export interface WireApp {
  id: string;
  organizationId: string;
  name: string;
  status: "creating" | "ready" | "failed";
  createAttemptId: string | null;
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
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
