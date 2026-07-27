import type * as React from "react";
import { AppSidebar } from "./app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./sidebar";

/**
 * Chrome shared by every signed-in page: the sidebar, and a header carrying
 * the page title. The trigger repeats here because the one in the sidebar
 * header is unreachable once the sidebar collapses to icons.
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
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
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
      </SidebarInset>
    </SidebarProvider>
  );
}
