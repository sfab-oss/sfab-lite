import { Link, type LinkProps } from "@tanstack/react-router";
import { Fragment } from "react";
import { cn } from "../../lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../ui/breadcrumb";

export interface AppBreadcrumbItem {
  title: string;
  to?: NonNullable<LinkProps["to"]>;
}

export function AppBreadcrumbs({
  items = [],
  className,
}: {
  items?: AppBreadcrumbItem[];
  className?: string;
}) {
  const all: AppBreadcrumbItem[] = [
    { title: "Overview", to: "/overview" },
    ...items,
  ];

  return (
    <Breadcrumb className={cn("min-w-0 flex-1 overflow-hidden", className)}>
      <BreadcrumbList className="min-w-0 flex-nowrap">
        {all.map((item, index) => {
          const isLast = index === all.length - 1;
          const key = `${item.to ?? item.title}-${index}`;
          return (
            <Fragment key={key}>
              {index === 0 ? null : (
                <BreadcrumbSeparator className="shrink-0" />
              )}
              <BreadcrumbItem
                className={
                  isLast ? "min-w-0 flex-1 overflow-hidden" : "shrink-0"
                }
              >
                {item.to && !isLast ? (
                  <BreadcrumbLink render={<Link to={item.to} />}>
                    {item.title}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage
                    className={isLast ? "block min-w-0 truncate" : undefined}
                  >
                    {item.title}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
