import type { SubAgentClass } from "agents";

let appThreadClass: SubAgentClass | null = null;

export function registerAppThreadClass(cls: SubAgentClass): void {
  appThreadClass = cls;
}

export function requireAppThreadClass(): SubAgentClass {
  if (!appThreadClass) {
    throw new Error(
      "AppThread class not registered — export it from the worker entry"
    );
  }
  return appThreadClass;
}
