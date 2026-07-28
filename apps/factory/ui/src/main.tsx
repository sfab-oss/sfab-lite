import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthRequiredError } from "./api";
import { App } from "./app";
import { endUnusableSession } from "./auth-client";
import { RouterProvider } from "./router";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root missing");
}

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

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider>
        <App />
      </RouterProvider>
    </QueryClientProvider>
  </StrictMode>
);
