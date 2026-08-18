import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { TooltipProvider } from "../ui/tooltip";

export function Shell({
  children,
  sidebar,
  defaultOpen = true,
}: {
  children: ReactNode;
  sidebar: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <TooltipProvider delay={0}>
      <SidebarProvider defaultOpen={defaultOpen}>
        {sidebar}
        <div
          className={cn(
            "relative flex h-svh w-full min-w-0 flex-1 flex-col",
            "md:peer-data-[variant=inset]:pt-2 md:peer-data-[variant=inset]:pr-2",
            "md:peer-data-[variant=inset]:pb-2"
          )}
          data-slot="shell"
        >
          {children}
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export function ShellInset({
  className,
  children,
  ...props
}: ComponentProps<typeof SidebarInset>) {
  return (
    <SidebarInset
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-background shadow",
        className
      )}
      data-slot="shell-inset"
      {...props}
    >
      {children}
    </SidebarInset>
  );
}

export function ShellPage({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      data-slot="shell-page"
      {...props}
    >
      {children}
    </div>
  );
}

export function ShellHeaderSidebarTrigger({
  className,
  toggleLabel = "Toggle Sidebar",
}: {
  className?: string;
  toggleLabel?: string;
}) {
  const { state } = useSidebar();

  return (
    <>
      <SidebarTrigger
        className={cn("shrink-0 md:hidden", className)}
        data-slot="shell-header-sidebar-trigger"
        toggleLabel={toggleLabel}
      />
      {state === "collapsed" ? (
        <SidebarTrigger
          className={cn("hidden shrink-0 md:inline-flex", className)}
          data-slot="shell-header-sidebar-trigger"
          toggleLabel={toggleLabel}
        />
      ) : null}
    </>
  );
}

export function ShellHeader({
  className,
  children,
  ...props
}: ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex h-10 min-w-0 shrink-0 items-center gap-2 border-b bg-background px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-10",
        className
      )}
      data-slot="shell-header"
      {...props}
    >
      {children}
    </header>
  );
}

export function ShellHeaderActions({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("ml-auto flex shrink-0 items-center gap-2", className)}
      data-slot="shell-header-actions"
      {...props}
    >
      {children}
    </div>
  );
}

export function ShellContent({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col overflow-hidden",
        className
      )}
      data-slot="shell-content"
      {...props}
    >
      {children}
    </div>
  );
}
