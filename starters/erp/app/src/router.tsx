import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryProvider } from "./components/providers/query-provider";
import { publicBase } from "./lib/public-base";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const TRAILING_SLASH = /\/$/;

function routerBasepath(): string {
  if (!publicBase) {
    return "/";
  }
  try {
    const path = new URL(publicBase).pathname.replace(TRAILING_SLASH, "");
    return path.length > 0 ? path : "/";
  } catch {
    return "/";
  }
}

export const router = createRouter({
  routeTree,
  basepath: routerBasepath(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}

createRoot(root).render(
  <StrictMode>
    <QueryProvider>
      <RouterProvider router={router} />
    </QueryProvider>
  </StrictMode>
);
