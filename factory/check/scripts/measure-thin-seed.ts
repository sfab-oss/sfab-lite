/**
 * Is the starter too fat? Same union / entities-page harness, but every
 * Base UI widget except button + input is a DOM-null stub (no @base-ui import).
 *
 *   node scripts/run-measure.mjs measure-thin-seed.ts
 */

import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  clientPrefixesFromManifest,
  createAppLsState,
  getLanguageService,
} from "@sfab-lite/verbs/check";
import { SEED_MANIFEST } from "./seed-manifest.ts";

const CLIENT_ENTITIES = "/app/src/ui/routes/entities.tsx";

const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort(),
];

const STUBBED_WIDGETS = [
  "/app/src/ui/components/ui/avatar.tsx",
  "/app/src/ui/components/ui/badge.tsx",
  "/app/src/ui/components/ui/dropdown-menu.tsx",
  "/app/src/ui/components/ui/sheet.tsx",
  "/app/src/ui/components/ui/sidebar.tsx",
  "/app/src/ui/components/ui/tooltip.tsx",
] as const;

const WIDGET_STUB = `
import type * as React from "react";

type P = React.PropsWithChildren<Record<string, unknown>>;

function N(_props: P) {
  return null;
}

export const Avatar = N;
export const AvatarFallback = N;
export const Badge = N;
export const badgeVariants = (..._args: unknown[]) => "";
export const DropdownMenu = N;
export const DropdownMenuContent = N;
export const DropdownMenuGroup = N;
export const DropdownMenuItem = N;
export const DropdownMenuLabel = N;
export const DropdownMenuSeparator = N;
export const DropdownMenuTrigger = N;
export const Sheet = N;
export const SheetContent = N;
export const SheetDescription = N;
export const SheetHeader = N;
export const SheetTitle = N;
export const Tooltip = N;
export const TooltipContent = N;
export const TooltipTrigger = N;
export const Sidebar = N;
export const SidebarContent = N;
export const SidebarFooter = N;
export const SidebarGroup = N;
export const SidebarGroupLabel = N;
export const SidebarHeader = N;
export const SidebarInset = N;
export const SidebarMenu = N;
export const SidebarMenuButton = N;
export const SidebarMenuItem = N;
export const SidebarProvider = N;
export const SidebarTrigger = N;
`.trim();

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    files[`/app/${path}`] = text;
  }
}

const thinFiles: Record<string, string> = { ...files };
for (const p of STUBBED_WIDGETS) {
  thinFiles[p] = WIDGET_STUB;
}

const allAppFiles = Object.keys(files).sort();

function heapMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
}

function overlayOf(src: Record<string, string>) {
  const st = createAppLsState(clientPrefixesFromManifest(SEED_MANIFEST));
  for (const [p, text] of Object.entries(src)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  return st;
}

function measure(
  label: string,
  programRoots: string[],
  src: Record<string, string>
) {
  const before = heapMb();
  const st = overlayOf(src);
  st.rootFiles = [...programRoots, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);

  const t0 = Date.now();
  let diagnostics = 0;
  for (const r of programRoots) {
    diagnostics += ls.getSemanticDiagnostics(r).length;
  }
  const ms = Date.now() - t0;

  const p = ls.getProgram();
  const sfs = p ? p.getSourceFiles() : [];
  const bytes = sfs.reduce((n, s) => n + s.text.length, 0);
  const baseUiFiles = sfs.filter((s) =>
    s.fileName.includes("@base-ui/")
  ).length;
  const after = heapMb();
  const row = {
    label,
    programRoots: programRoots.length,
    loadedFiles: sfs.length,
    baseUiFiles,
    loadedTextMb: Number((bytes / 1_048_576).toFixed(2)),
    diagnostics,
    ms,
    heapRetainedMb: Number((after - before).toFixed(0)),
  };
  console.log(JSON.stringify(row));
  return row;
}

measure("union (today)", allAppFiles, files);
measure("union, two base-ui widgets", allAppFiles, thinFiles);
measure("entities page, import closure (today)", [CLIENT_ENTITIES], files);
measure(
  "entities page, import closure, two widgets",
  [CLIENT_ENTITIES],
  thinFiles
);
