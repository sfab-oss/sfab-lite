import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryProvider } from "./components/providers/query-provider";
import { router } from "./router";
import "./styles.css";

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
