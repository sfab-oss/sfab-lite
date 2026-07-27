export type ThreadStatus = "done" | "idle" | "needs-you" | "running";

export interface Thread {
  appId: string | null;
  appName: string | null;
  headline?: string;
  id: string;
  readOnly: boolean;
  startedLabel: string;
  startedMinutesAgo?: number;
  status: ThreadStatus;
  title: string;
  updatedLabel: string;
  updatedMinutesAgo: number;
}

export interface SlashCommand {
  description: string;
  id: string;
  name: string;
}

export interface AppVersion {
  createdAt: string;
  id: string;
  label: string;
  live: boolean;
}

export interface Subagent {
  agentType: string;
  durationMs?: number;
  id: string;
  prompt: string;
  seed: string;
  status: "done" | "failed" | "running";
  steps: {
    detail?: string;
    kind: "reasoning" | "text" | "tool";
    label: string;
  }[];
  title: string;
}

export interface AttachedFile {
  filename: string;
  mediaType?: string;
  url?: string;
}

export interface WorkspaceFileEntry {
  name: string;
  path: string;
  type: "directory" | "file";
}

export interface WorkspaceFileContent {
  content: string;
  encoding: "binary" | "text" | "too-large";
  mimeType: string;
  size: number;
}
