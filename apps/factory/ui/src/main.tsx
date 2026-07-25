import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { RouterProvider } from "./router";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root missing");
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider>
      <App />
    </RouterProvider>
  </StrictMode>
);
