export type PushParse =
  | { ok: true; remote: string | null; branch: string }
  | { ok: false; error: string };

/**
 * Supported: `git push`, `git push origin`, `git push origin main`,
 * `git push origin HEAD:main`. Flags and other arities are rejected.
 */
export function parsePushArgs(rest: string[]): PushParse {
  if (rest.some((a) => a.startsWith("-"))) {
    return {
      ok: false,
      error: "git push: flags are not supported in this shell\n",
    };
  }
  if (rest.length === 0) {
    return { ok: true, remote: null, branch: "main" };
  }
  if (rest.length === 1) {
    return { ok: true, remote: rest[0] ?? null, branch: "main" };
  }
  if (rest.length === 2) {
    const remote = rest[0] ?? "origin";
    const refspec = rest[1] ?? "main";
    if (refspec.includes(":")) {
      const colon = refspec.indexOf(":");
      const src = refspec.slice(0, colon);
      const dst = refspec.slice(colon + 1);
      if (!dst || dst.includes(":") || dst.includes("*")) {
        return {
          ok: false,
          error: `git push: unsupported refspec '${refspec}'\n`,
        };
      }
      if (src !== "" && src !== "HEAD" && src !== dst) {
        return {
          ok: false,
          error: `git push: unsupported refspec '${refspec}' (only HEAD:<branch> or <branch>:<branch>)\n`,
        };
      }
      return { ok: true, remote, branch: dst };
    }
    return { ok: true, remote, branch: refspec };
  }
  return {
    ok: false,
    error:
      "git push: unsupported arguments (use `git push`, `git push origin`, or `git push origin <branch>`)\n",
  };
}
