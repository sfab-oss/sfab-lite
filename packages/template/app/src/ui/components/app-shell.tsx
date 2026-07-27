import { Outlet } from "@tanstack/react-router";
import type * as React from "react";
import { AppSidebar } from "./app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./sidebar";

/**
 * The signed-in chrome, mounted once by the layout route rather than by each
 * page. `SidebarProvider` holds the collapsed state in React state, so a page
 * that rendered its own would reset the sidebar on every navigation.
 */
export function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * One page inside that chrome: a header carrying the title, then the content.
 * The trigger repeats here because the one in the sidebar header is hidden
 * once the sidebar collapses to icons.
 */
export function AppShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <h1 className="truncate font-medium text-sm">{title}</h1>
        {actions ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
          </div>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6">
        {children}
      </div>
    </>
  );
}
