import { Separator } from "@sfab-lite/ui/components/shadcn/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@sfab-lite/ui/components/shadcn/sidebar";
import { cn } from "@sfab-lite/ui/lib/utils";

/**
 * Sidebar expand button surfaced inside a page header. Visible on mobile
 * (the sidebar lives in a sheet, so the trigger is always needed) and on
 * desktop only when the sidebar is collapsed to icon mode — when expanded,
 * the collapse trigger lives inside the sidebar itself. Pulled out so each
 * page header can drop it in next to the breadcrumbs without each route
 * re-implementing the same `useSidebar()` gate.
 */
function HeaderSidebarTrigger({ className }: { className?: string }) {
  const { state } = useSidebar();

  return (
    <>
      <SidebarTrigger className={cn("shrink-0 md:hidden", className)} />
      {state === "collapsed" && (
        <SidebarTrigger
          className={cn("hidden shrink-0 md:inline-flex", className)}
        />
      )}
    </>
  );
}

// --- 1. Global Shell (Layout Wrapper) ---

export function AppLayout({
  children,
  sidebar,
  footer,
  defaultOpen = true,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  /** Optional content rendered as a sibling *below* the rounded card.
   *  Use this for project-scoped chrome (the chat dock) that should sit
   *  outside the card boundary but inside the AppLayout column so it stays
   *  beside the sidebar. */
  footer?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      {sidebar}
      <div
        className={cn(
          // `min-w-0` lets this column shrink below its content's intrinsic
          // width — without it, a wide footer (the chat dock with many tabs)
          // would push the whole panel horizontally instead of scrolling
          // inside the dock bar's own `overflow-x-auto` strip.
          "relative flex h-svh w-full min-w-0 flex-1 flex-col",
          "md:peer-data-[variant=inset]:pt-2 md:peer-data-[variant=inset]:pr-2",
          !footer && "md:peer-data-[variant=inset]:pb-2"
        )}
      >
        <SidebarInset className="flex-1 overflow-hidden rounded-xl bg-background shadow">
          {children}
        </SidebarInset>
        {footer}
      </div>
    </SidebarProvider>
  );
}

// --- 2. Page Container ---

export function AppLayoutPage({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex h-full w-full flex-col overflow-hidden", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// --- 3. Header System ---

export function AppLayoutHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 border-b bg-background px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-10",
        className
      )}
      {...props}
    >
      <HeaderSidebarTrigger className="-ml-1" />
      <Separator className="mr-2 h-4 md:hidden" orientation="vertical" />
      {children}
    </header>
  );
}

export function AppLayoutHeaderActions({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("ml-auto flex items-center gap-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function AppLayoutSubheader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center border-b bg-background px-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
