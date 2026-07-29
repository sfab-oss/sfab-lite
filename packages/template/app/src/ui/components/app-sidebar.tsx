import {
  BoxIcon,
  CaretSortIcon,
  CubeIcon,
  DashboardIcon,
  ExitIcon,
  FileTextIcon,
  GearIcon,
  PersonIcon,
} from "@radix-ui/react-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import { sessionQueryOptions } from "../lib/session";
import { Avatar, AvatarFallback } from "./avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
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
} from "./sidebar";

const WHITESPACE = /\s+/;

const NAV = [
  { to: "/overview", label: "Overview", icon: DashboardIcon },
  { to: "/documents", label: "Documents", icon: FileTextIcon },
  { to: "/entities", label: "Parties", icon: PersonIcon },
  { to: "/catalog", label: "Catalog", icon: CubeIcon },
] as const;

function initials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(WHITESPACE).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/** Exact match for leaves; `/documents/abc` still lights Documents. */
function isActivePath(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppSidebar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const userName = session.data?.user?.name;
  const userEmail = session.data?.user?.email;
  const orgName = session.data?.organization?.name ?? "Organization";

  async function onSignOut() {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/" });
  }

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BoxIcon className="size-4" />
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <span className="block truncate font-semibold text-sm">
                {orgName}
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                Operations
              </span>
            </div>
            <SidebarTrigger className="hidden group-data-[collapsible=icon]:hidden md:flex" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  isActive={isActivePath(pathname, item.to)}
                  render={<Link to={item.to} />}
                  tooltip={item.label}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size="lg" tooltip={userEmail ?? "Account"}>
                    <Avatar size="sm">
                      <AvatarFallback>
                        {initials(userName, userEmail)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid min-w-0 flex-1 text-left leading-tight">
                      <span className="truncate font-medium text-sm">
                        {userName ?? "Account"}
                      </span>
                      <span className="truncate text-muted-foreground text-xs">
                        {userEmail}
                      </span>
                    </div>
                    <CaretSortIcon className="ml-auto" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent
                align="end"
                className="w-56"
                side="top"
                sideOffset={8}
              >
                <DropdownMenuLabel>{orgName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<Link to="/settings" />}>
                    <GearIcon />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} variant="destructive">
                  <ExitIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
