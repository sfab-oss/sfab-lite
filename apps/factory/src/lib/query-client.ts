import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { AuthRequiredError } from "@/api";
import { endUnusableSession } from "@/auth-client";

function onAuthRequired(error: unknown) {
  if (!(error instanceof AuthRequiredError)) {
    return;
  }
  endUnusableSession().catch(() => undefined);
}

/** Module singleton so route `beforeLoad` and React share one cache. */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthRequired }),
  mutationCache: new MutationCache({ onError: onAuthRequired }),
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});
