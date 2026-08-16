/**
 * The schema each migration left behind, recorded beside it.
 *
 * `db:generate` needs to know what the database looks like before it can say
 * what to change. Reading that from the database costs a round trip, an
 * authorization surface, and a test suite that can only fake it. Recording it
 * instead — at the moment the migration is written, from the schema the
 * migration implements — makes generating a migration a pure function of the
 * workspace, which is both cheaper and the thing drizzle-kit's `meta/`
 * directory has always done.
 *
 * The trade is deliberate and stated in ADR-0005: a snapshot describes what
 * the SQL beside it was derived from, not what the database did with it.
 */
import type { ManifestV0 } from "@sfab-lite/core";
import type { SchemaSnapshot } from "./schema-ddl.js";

const SNAPSHOT_SUFFIX = "_snapshot.json";
const SQL_SUFFIX = /\.sql$/;

function metaPrefix(manifest: ManifestV0): string {
  return `${manifest.migrations}/meta/`;
}

/** An app before its first migration: no tables, so everything is new. */
export const EMPTY_SNAPSHOT: SchemaSnapshot = { tables: [] };

/**
 * Where the snapshot for a migration lives.
 *
 * Named for the migration rather than numbered independently, so a pair that
 * has drifted apart is visible in a directory listing.
 */
export function snapshotPathFor(
  migrationPath: string,
  manifest: ManifestV0
): string {
  const id = migrationPath
    .slice(manifest.migrations.length + 1)
    .replace(SQL_SUFFIX, "");
  return `${metaPrefix(manifest)}${id}${SNAPSHOT_SUFFIX}`;
}

function isSnapshotPath(path: string, prefix: string): boolean {
  return path.startsWith(prefix) && path.endsWith(SNAPSHOT_SUFFIX);
}

/**
 * The most recent snapshot in the workspace, or an empty one.
 *
 * Highest filename wins, for the same reason migrations run in filename order:
 * the number is the history. An app with migrations but no snapshots reads as
 * empty, which would then propose creating tables that already exist — the
 * template ships its own snapshot so that a seeded app never sits in that
 * state, and `check:template-snapshot` is what keeps it shipping one.
 */
export function latestSnapshot(
  files: Record<string, string>,
  manifest: ManifestV0
): SchemaSnapshot {
  const prefix = metaPrefix(manifest);
  const paths = Object.keys(files)
    .filter((path) => isSnapshotPath(path, prefix))
    .sort();
  const newest = paths.at(-1);
  if (!newest) {
    return EMPTY_SNAPSHOT;
  }
  const raw = files[newest];
  if (!raw) {
    return EMPTY_SNAPSHOT;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SchemaSnapshot>;
    return { tables: parsed.tables ?? [] };
  } catch (cause) {
    // A snapshot that will not parse is worse than one that is missing: it
    // would be silently read as "no tables" and generate a migration
    // recreating the whole schema. Refusing sends the agent to the file.
    throw new Error(
      `${newest} is not valid JSON. It records the schema the migrations beside it produced, and db:generate cannot proceed without it.`,
      { cause }
    );
  }
}

/** Serialised the way the bake script writes it, so the two never differ. */
export function serializeSnapshot(snapshot: SchemaSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}
