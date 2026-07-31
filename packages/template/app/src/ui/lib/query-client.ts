import { QueryClient } from "@tanstack/react-query";

/**
 * One cache for the whole app. Shared at module scope so route guards can
 * read it before React renders — see `hooks/use-session.ts`.
 *
 * Defaults match the QueryProvider used in the React tree.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
  },
});
