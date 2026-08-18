import { Outlet } from "@tanstack/react-router";
import { AppSidebar } from "./app-sidebar";
import { Shell, ShellInset } from "./shell";

export function AppLayout() {
  return (
    <Shell sidebar={<AppSidebar />}>
      <ShellInset>
        <Outlet />
      </ShellInset>
    </Shell>
  );
}
