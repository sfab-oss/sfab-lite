/** Pure helpers for forge merge / ancestry checks (unit-testable). */

export function isFastForwardTip(
  mainTip: string | null,
  headTip: string,
  headAncestors: readonly string[]
): boolean {
  if (!mainTip || mainTip === headTip) {
    return true;
  }
  return headAncestors.includes(mainTip);
}
