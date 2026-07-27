/**
 * Migrations as they live in an app's workspace.
 *
 * An app's migrations are ordinary source files under `migrations/`, packed
 * into `sourceFiles` like everything else. That is deliberate: the agent can
 * read them, they travel with a version, and reverting a version reverts its
 * migrations too. The Durable Object applies them forward-only and records how
 * many it has run, so the file order *is* the schema history.
 */
import { TEMPLATE_MANIFEST } from "@sfab-lite/template";

export interface AppMigration {
  id: string;
  sql: string;
}

const MIGRATION_PREFIX = `${TEMPLATE_MANIFEST.migrations}/`;
const SQL_SUFFIX_RE = /\.sql$/;

function isMigrationPath(path: string): boolean {
  return path.startsWith(MIGRATION_PREFIX) && path.endsWith(".sql");
}

/**
 * Every migration in a workspace, in the order they must be applied.
 *
 * Sorted by filename, which is what makes the numeric prefix load-bearing —
 * `0002_notes.sql` runs after `0001_auth.sql` because it sorts after it, not
 * because anything parses the number. `localeCompare` is avoided on purpose:
 * its ordering is locale-dependent, and schema history must not be.
 */
export function collectMigrations(
  files: Record<string, string>
): AppMigration[] {
  return Object.keys(files)
    .filter(isMigrationPath)
    .sort()
    .map((path) => ({
      id: path.slice(MIGRATION_PREFIX.length).replace(SQL_SUFFIX_RE, ""),
      sql: files[path] ?? "",
    }));
}

const SLUG_UNSAFE_RE = /[^a-z0-9]+/g;
const SLUG_TRIM_RE = /^_+|_+$/g;

function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(SLUG_UNSAFE_RE, "_")
    .replace(SLUG_TRIM_RE, "");
  return cleaned || "schema";
}

/**
 * The path the next generated migration should take.
 *
 * Numbered one past the highest existing migration rather than by counting
 * them, so a gap in the sequence cannot produce a filename that collides with
 * one already there — a collision would silently overwrite history.
 */
export function nextMigrationPath(
  files: Record<string, string>,
  name: string
): string {
  const highest = collectMigrations(files).reduce((max, migration) => {
    const n = Number.parseInt(migration.id.slice(0, 4), 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  const index = String(highest + 1).padStart(4, "0");
  return `${MIGRATION_PREFIX}${index}_${slug(name)}.sql`;
}
