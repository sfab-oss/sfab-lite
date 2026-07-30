import { createFileRoute } from "@tanstack/react-router";
import { McpConsentPage } from "@/components/mcp/consent";

export const Route = createFileRoute("/mcp/consent")({
  ssr: false,
  component: McpConsentPage,
});
