import { Avatar, AvatarFallback } from "@sfab-lite/ui/components/shadcn/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sfab-lite/ui/components/shadcn/dropdown-menu";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@sfab-lite/ui/components/shadcn/sidebar";
import { ChevronsUpDown, LogOut, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback } from "react";
import { authClient } from "@/auth-client";

export function ThreadsSidebarFooter({
  onSignOut,
}: {
  onSignOut?: () => void;
}) {
  const { isMobile } = useSidebar();
  const { data: session } = authClient.useSession();
  const { theme, setTheme } = useTheme() as {
    theme: string | undefined;
    setTheme: (theme: string) => void;
  };
  const email = session?.user?.email ?? "signed in";
  const name = session?.user?.name?.trim() || email.split("@")[0] || "User";
  const initials = name.slice(0, 2).toUpperCase();
  const nextTheme = theme === "light" ? "dark" : "light";

  const handleSignOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch {
      // Session may already be gone; still leave the console.
    }
    onSignOut?.();
  }, [onSignOut]);

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  size="lg"
                />
              }
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{name}</span>
                      <span className="truncate text-xs">{email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme(nextTheme)}>
                <SunIcon className="hidden [html.dark_&]:block" />
                <MoonIcon className="hidden [html.light_&]:block" />
                {nextTheme === "dark" ? "Dark mode" : "Light mode"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
