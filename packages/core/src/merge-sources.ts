/** Merge base sources with an overlay (`null` deletes a key). */
export function mergeSources(
  base: Record<string, string>,
  overlay: Record<string, string | null>
): Record<string, string> {
  const out: Record<string, string> = { ...base };
  for (const [rel, val] of Object.entries(overlay)) {
    if (val === null) {
      delete out[rel];
    } else {
      out[rel] = val;
    }
  }
  return out;
}
