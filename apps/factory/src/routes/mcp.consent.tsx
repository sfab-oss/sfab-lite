import { createFileRoute } from "@tanstack/react-router";
import { McpConsentScreen } from "@/screens/mcp-consent";

export const Route = createFileRoute("/mcp/consent")({
  ssr: false,
  component: McpConsentScreen,
});
