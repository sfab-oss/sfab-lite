const STORAGE_KEY = "sfab.factory.previewCodeOpen";

export function readPreviewCodeOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writePreviewCodeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  } catch {
    // Quota / private mode — preference is best-effort.
  }
}
