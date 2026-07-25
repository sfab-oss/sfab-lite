import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";
import { queryClient } from "./query-client";

async function fetchSession() {
  const res = await api.api["session-context"].$get();
  if (!res.ok) {
    throw new Error(`session-context ${res.status}`);
  }
  return await res.json();
}

export type Session = Awaited<ReturnType<typeof fetchSession>>;

export const sessionQueryOptions = queryOptions({
  queryKey: ["session-context"],
  queryFn: fetchSession,
});

/**
 * Read the session for a route guard. Goes through the query cache, so the
 * guard and the page it guards share one request instead of one each.
 */
export function loadSession(): Promise<Session> {
  return queryClient.ensureQueryData(sessionQueryOptions);
}

/**
 * After sign-in/out or joining an org, refetch the session and wait for it.
 *
 * Must not be `invalidateQueries`. Every reader of this query is a route guard
 * calling {@link loadSession}, and a guard registers no observer — so the query
 * is never *active*, and `invalidateQueries` marks it stale without refetching
 * anything. The caller then navigates, the guard re-reads the pre-org session
 * from cache, and redirects straight back to where it came from. Onboarding
 * looked like it silently failed until you reloaded the page.
 *
 * `fetchQuery` with `staleTime: 0` sidesteps active/inactive semantics
 * entirely: it always fetches, always writes the cache, and the returned
 * promise settles only once the fresh session is in place.
 */
export function invalidateSession(): Promise<Session> {
  return queryClient.fetchQuery({ ...sessionQueryOptions, staleTime: 0 });
}
