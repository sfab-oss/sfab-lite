import type { AppRecord } from "../registry/app-registry.js";
import type { WorkspaceRecord } from "../registry/workspace-registry.js";

export interface WireApp {
  id: string;
  organizationId: string;
  name: string;
  template: string;
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
    template: record.template,
    status: record.status,
    createAttemptId: record.createAttemptId,
    liveSha: record.liveSha,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export interface WireWorkspace {
  id: string;
  appId: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export function wireWorkspace(record: WorkspaceRecord): WireWorkspace {
  return {
    id: record.id,
    appId: record.appId,
    name: record.name,
    isDefault: record.isDefault,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
