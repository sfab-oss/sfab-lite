import { Outlet } from "@tanstack/react-router";
import type * as React from "react";
import { AppNav } from "./app-nav";

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppNav />
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}

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
