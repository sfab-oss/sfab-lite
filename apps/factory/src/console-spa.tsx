import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { AuthRequiredError } from "../ui/src/api";
import { App } from "../ui/src/app";
import { endUnusableSession } from "../ui/src/auth-client";
import { RouterProvider } from "../ui/src/router";

function onAuthRequired(error: unknown) {
  if (!(error instanceof AuthRequiredError)) {
    return;
  }
  endUnusableSession().catch(() => undefined);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthRequired }),
  mutationCache: new MutationCache({ onError: onAuthRequired }),
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

/**
 * Phase 1 shell: existing `ui/` console (custom router) mounted under Start.
 * SSR off — the UI router reads `window.location` at init.
 */
export function ConsoleSpa() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider>
        <App />
      </RouterProvider>
    </QueryClientProvider>
  );
}
