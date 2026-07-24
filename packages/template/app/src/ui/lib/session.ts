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

/** After sign-in/out or joining an org, the cached answer is stale. */
export function invalidateSession(): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: sessionQueryOptions.queryKey,
  });
}
