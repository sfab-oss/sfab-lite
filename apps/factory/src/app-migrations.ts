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

export const SCHEMA_VERSION_DDL = `
CREATE TABLE IF NOT EXISTS _sfab_schema_version (
  version INTEGER PRIMARY KEY NOT NULL
);`;

export type ExecSql = (
  query: string,
  ...binds: unknown[]
) => Record<string, unknown>[];

/**
 * How many migrations this database has already run.
 *
 * `version` is itself the primary key, so writing 3 beside an existing 2 adds
 * a row rather than replacing one — a database can hold several. `MAX` is the
 * only reading that stays true there; taking an arbitrary row would under-report
 * the version and re-run a migration that had already been applied.
 */
export function readSchemaVersion(exec: ExecSql): number {
  const rows = exec(
    "SELECT MAX(version) AS version FROM _sfab_schema_version"
  ) as { version?: number | null }[];
  return rows[0]?.version ?? 0;
}

/**
 * Run every migration the database has not run yet, in order.
 *
 * Forward-only, and the version is the count rather than a name — an app's
 * migration list only ever grows, and it travels with the version that
 * introduced it.
 */
export function applyPendingMigrations(
  exec: ExecSql,
  migrations: AppMigration[]
): { previousVersion: number; applied: number } {
  const previousVersion = readSchemaVersion(exec);
  if (migrations.length === 0 || previousVersion >= migrations.length) {
    return { previousVersion, applied: 0 };
  }
  for (let i = previousVersion; i < migrations.length; i++) {
    const migration = migrations[i];
    if (migration) {
      exec(migration.sql);
    }
  }
  exec("DELETE FROM _sfab_schema_version");
  exec(
    "INSERT INTO _sfab_schema_version (version) VALUES (?)",
    migrations.length
  );
  return {
    previousVersion,
    applied: migrations.length - previousVersion,
  };
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
