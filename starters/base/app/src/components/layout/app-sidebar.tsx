import { CubeIcon } from "@radix-ui/react-icons";
import { Link, useRouterState } from "@tanstack/react-router";
import { useSession } from "../../hooks/use-session";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { AppSidebarFooter } from "./app-sidebar-footer";
import {
  getPlatformNavigationItems,
  isPlatformNavActive,
} from "./platform-navigation";

export function AppSidebar() {
  const session = useSession();
  const orgName = session.data?.organization?.name ?? "sfab-lite";

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CubeIcon className="size-5" />
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <span className="block truncate font-semibold">{orgName}</span>
            </div>
            <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
              <SidebarTrigger
                className="hidden h-8 w-8 md:flex"
                toggleLabel="Toggle Sidebar"
              />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
          <SidebarMenuItem>
            <SidebarTrigger className="h-8 w-8" toggleLabel="Toggle Sidebar" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="overflow-x-hidden">
        <AppSidebarMainNavigation />
      </SidebarContent>
      <SidebarFooter>
        <AppSidebarFooter />
      </SidebarFooter>
    </Sidebar>
  );
}

function useCloseMobileSidebarOnNavigate() {
  const { isMobile, setOpenMobile } = useSidebar();
  return () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
}

function AppSidebarMainNavigation() {
  const closeOnNavigate = useCloseMobileSidebarOnNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const items = getPlatformNavigationItems();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspace</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isActive = isPlatformNavActive(pathname, item.url);
          return (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                isActive={isActive}
                render={<Link onClick={closeOnNavigate} to={item.url} />}
                tooltip={item.title}
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
