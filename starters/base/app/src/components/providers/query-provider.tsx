import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../../lib/query-client";

/**
 * Shared module-scoped client so route guards (`loadSession`) and the React
 * tree read the same cache. Do not construct a second QueryClient here.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
