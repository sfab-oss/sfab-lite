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
);
CREATE TABLE IF NOT EXISTS _sfab_migrations (
  id TEXT PRIMARY KEY NOT NULL,
  ordinal INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  applied_at INTEGER NOT NULL
    DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);`;

/**
 * FNV-1a over the migration's bytes.
 *
 * Detection, not defence. The file this guards is edited by an agent or by the
 * app's owner, never by an adversary constructing a collision — Flyway ships
 * CRC32 for the same job. A cryptographic digest would mean `crypto.subtle`,
 * which is async, and would push an `await` through a call chain whose
 * synchronous shape is what lets it be tested without a Durable Object.
 */
export function migrationChecksum(sql: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(sql)) {
    // biome-ignore lint/suspicious/noBitwiseOperators: FNV-1a is defined as xor-then-multiply; without the xor it is a different function.
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

interface AppliedMigration {
  id: string;
  checksum: string;
}

function readLedger(exec: ExecSql): AppliedMigration[] {
  return exec(
    "SELECT id, checksum FROM _sfab_migrations ORDER BY ordinal"
  ) as unknown as AppliedMigration[];
}

/**
 * Adopt the files an older database ran before it kept a ledger.
 *
 * Those apps recorded only a count, so the first `N` files are what they must
 * have applied — there is nothing else it could mean. Adopting them is the
 * only reading available; refusing would strand every app that predates the
 * ledger, and re-running them would fail on the first `CREATE TABLE`.
 */
function adoptCountedMigrations(
  exec: ExecSql,
  migrations: AppMigration[]
): AppliedMigration[] {
  const counted = Math.min(readSchemaVersion(exec), migrations.length);
  const adopted: AppliedMigration[] = [];
  for (let i = 0; i < counted; i++) {
    const migration = migrations[i];
    if (!migration) {
      continue;
    }
    const checksum = migrationChecksum(migration.sql);
    exec(
      "INSERT INTO _sfab_migrations (id, ordinal, checksum) VALUES (?, ?, ?)",
      migration.id,
      i,
      checksum
    );
    adopted.push({ id: migration.id, checksum });
  }
  return adopted;
}

/**
 * Refuse when the history on disk no longer matches the history that ran.
 *
 * A migration is immutable once applied. Nothing in an app workspace enforces
 * that on its own: an agent can edit `migrations/0002_erp.sql` as easily as any
 * other file, the applier would not re-run it, and the database would silently
 * stop matching the files that claim to describe it. In an ordinary project
 * git history and review are what make this visible; here it is this check.
 */
function verifyAppliedUnchanged(
  applied: AppliedMigration[],
  migrations: AppMigration[]
): void {
  for (const [index, row] of applied.entries()) {
    const migration = migrations[index];
    if (!migration || migration.id !== row.id) {
      throw new Error(
        `migration ${row.id} has already been applied to this database, but it is no longer file ${index + 1} in migrations/. Restore it — history that has run cannot be rewritten.`
      );
    }
    if (migrationChecksum(migration.sql) !== row.checksum) {
      throw new Error(
        `migration ${row.id} has already been applied to this database and its contents have changed since. Restore it and add a new migration for the change you wanted.`
      );
    }
  }
}

export type ExecSql = (
  query: string,
  ...binds: unknown[]
) => Record<string, unknown>[];

/**
 * The count a database kept before it kept a ledger. Read once, to adopt it.
 *
 * `version` is itself the primary key, so writing 3 beside an existing 2 added
 * a row rather than replacing one — a database can hold several. `MAX` is the
 * only reading that stays true there; taking an arbitrary row would
 * under-report the count and adopt fewer migrations than actually ran.
 */
function readSchemaVersion(exec: ExecSql): number {
  const rows = exec(
    "SELECT MAX(version) AS version FROM _sfab_schema_version"
  ) as { version?: number | null }[];
  return rows[0]?.version ?? 0;
}

/**
 * Run every migration the database has not run yet, in order.
 *
 * Forward-only, and each applied migration is recorded by name and checksum
 * rather than counted. The count could not tell an edited migration from an
 * untouched one, or a deleted one from a database that was simply behind.
 */
export function applyPendingMigrations(
  exec: ExecSql,
  migrations: AppMigration[]
): { previousVersion: number; applied: number } {
  let done = readLedger(exec);
  if (done.length === 0) {
    done = adoptCountedMigrations(exec, migrations);
  }
  const previousVersion = done.length;
  if (previousVersion > migrations.length) {
    throw new Error(
      `this database has run ${previousVersion} migrations but migrations/ holds ${migrations.length}. Restore the missing files — a migration that has run cannot be removed.`
    );
  }
  verifyAppliedUnchanged(done, migrations);

  for (let i = previousVersion; i < migrations.length; i++) {
    const migration = migrations[i];
    if (!migration) {
      continue;
    }
    exec(migration.sql);
    exec(
      "INSERT INTO _sfab_migrations (id, ordinal, checksum) VALUES (?, ?, ?)",
      migration.id,
      i,
      migrationChecksum(migration.sql)
    );
  }

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
