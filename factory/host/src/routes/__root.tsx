import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { queryClient } from "@/lib/query-client";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    links: [{ href: appCss, rel: "stylesheet" }],
    meta: [
      { charSet: "utf-8" },
      {
        content: "width=device-width, initial-scale=1",
        name: "viewport",
      },
      { title: "sfab-lite factory" },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
