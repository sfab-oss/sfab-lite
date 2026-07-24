import { QueryClient } from "@tanstack/react-query";

/**
 * One cache for the whole app. Shared at module scope so route guards can
 * read it before React renders — see `session.ts`.
 */
export const queryClient = new QueryClient();
