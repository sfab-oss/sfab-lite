import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { endUnusableSession } from "@/auth-client";
import { AuthRequiredError } from "@/lib/api-errors";

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
