import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { client } from "../lib/client";
import { queryClient } from "../lib/query-client";

export type Session = InferResponseType<
  (typeof client.protected)["session-context"]["$get"],
  200
>;

const getSessionKey = () => ["session-context"] as const;

async function fetchSession(): Promise<Session> {
  const res = await client.protected["session-context"].$get();
  if (!res.ok) {
    throw new Error(`session-context ${res.status}`);
  }
  return await res.json();
}

export function useSession() {
  return useQuery({
    queryKey: getSessionKey(),
    queryFn: fetchSession,
  });
}

/**
 * Read the session for a route guard. Goes through the query cache, so the
 * guard and the page it guards share one request instead of one each.
 */
export function loadSession(): Promise<Session> {
  return queryClient.ensureQueryData({
    queryKey: getSessionKey(),
    queryFn: fetchSession,
  });
}

/**
 * After sign-in/out or joining an org, refetch the session and wait for it.
 *
 * Must not be `invalidateQueries`. Every reader of this query is a route guard
 * calling {@link loadSession}, and a guard registers no observer — so the query
 * is never *active*, and `invalidateQueries` marks it stale without refetching
 * anything.
 */
export function invalidateSession(): Promise<Session> {
  return queryClient.fetchQuery({
    queryKey: getSessionKey(),
    queryFn: fetchSession,
    staleTime: 0,
  });
}
