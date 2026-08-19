import {
  CounterClockwiseClockIcon,
  CubeIcon,
  DashboardIcon,
  FileTextIcon,
  GearIcon,
  HomeIcon,
  PersonIcon,
} from "@radix-ui/react-icons";
import type { LinkProps } from "@tanstack/react-router";
import type { ComponentType } from "react";

export interface PlatformNavigationItem {
  title: string;
  url: NonNullable<LinkProps["to"]>;
  icon: ComponentType<{ className?: string }>;
}

export function getPlatformNavigationItems(): PlatformNavigationItem[] {
  return [
    { title: "Overview", url: "/overview", icon: HomeIcon },
    { title: "Parties", url: "/parties", icon: PersonIcon },
    { title: "Items", url: "/items", icon: CubeIcon },
    { title: "Invoices", url: "/invoices", icon: FileTextIcon },
    {
      title: "Open balances",
      url: "/balances",
      icon: CounterClockwiseClockIcon,
    },
    { title: "Gallery", url: "/gallery", icon: DashboardIcon },
    { title: "Settings", url: "/settings", icon: GearIcon },
  ];
}

export function isPlatformNavActive(pathname: string, url: string): boolean {
  if (url === "/overview") {
    return pathname === "/overview";
  }
  return pathname === url || pathname.startsWith(`${url}/`);
}
