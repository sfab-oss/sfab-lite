const ROUTE_PATH = /\bpath:\s*(['"`])(\/[^'"`]*?)\1/g;

function extractAppRoutes(source: string | null | undefined): string[] {
  if (!source) {
    return [];
  }
  try {
    const found = new Set<string>();
    for (const match of source.matchAll(ROUTE_PATH)) {
      const path = match[2];
      if (path) {
        found.add(path);
      }
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function appQuickLinks(source: string | null | undefined): string[] {
  const routes = extractAppRoutes(source);
  if (routes.length === 0) {
    return ["/"];
  }
  return routes;
}
