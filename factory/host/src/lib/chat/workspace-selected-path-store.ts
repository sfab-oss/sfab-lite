import { create } from "zustand";

interface WorkspaceSelectedPathState {
  byWorkspace: Record<string, string | null>;
  setSelectedPath: (workspaceId: string, path: string | null) => void;
}

export const useWorkspaceSelectedPathStore =
  create<WorkspaceSelectedPathState>()((set) => ({
    byWorkspace: {},
    setSelectedPath: (workspaceId, path) =>
      set((state) => {
        if (state.byWorkspace[workspaceId] === path) {
          return state;
        }
        return {
          byWorkspace: { ...state.byWorkspace, [workspaceId]: path },
        };
      }),
  }));

export function useWorkspaceSelectedPath(workspaceId: string): string | null {
  return useWorkspaceSelectedPathStore(
    (s) => s.byWorkspace[workspaceId] ?? null
  );
}
