import { createFileRoute } from "@tanstack/react-router";
import { ConsoleSpa } from "../console-spa";

export const Route = createFileRoute("/$")({
  ssr: false,
  component: ConsoleSpa,
});
