import { createHash, randomUUID } from "node:crypto";
import { Database, type Queryable } from "./db.js";
import { loadMigrations, migrationLock } from "./migrations.js";

// Fixed release evidence, never generated from the directory being checked.
export const legacyBaselineSource =
  "git:fa1baa7d7524bf16f379c9c2837fa8cc9ef0bcac";
const trustedHistory = [
  [
    1,
    "001_core.sql",
    "eabfdd3e50fa312558f14aeb2e3277bdb2ee186d0892a320c0643bed329bb06c",
  ],
  [
    2,
    "002_automation.sql",
    "302e6d20b8aebfbed8431e852e1ef9e7c20c310bdaf11e89671f155cb49b09cb",
  ],
  [
    3,
    "003_agent_activity.sql",
    "2d8fcc6b498b053614464e1bc49322899041ca74b404b44fbfb13b9440c45e6c",
  ],
  [
    4,
    "004_message_event_order.sql",
    "5b7d6c9bcf202ad97276fececabe9e39c1422ebd9fbe25330158e7cac8339298",
  ],
  [
    5,
    "005_group_metadata.sql",
    "bbb67a43a41aaaf172f6ba9469a5ad4cc47563447dabf9d3d2bbf0444f1ae003",
  ],
  [
    6,
    "006_group_directory.sql",
    "760acc9148f851c1f6d75163655b65a0c15b7b7f929b4a57588c59ceecb9f533",
  ],
] as const;

// Compare definitions, not database-specific OIDs, data, sequence positions,
// owners, ACLs or tablespaces. Reference and target run on the same PG server.
const definitionQueries = {
  relations: `SELECT c.relname,c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,c.reloptions,
    pg_get_partkeydef(c.oid) AS partition_key,
    CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) END AS view_definition
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' ORDER BY c.relname`,
  columns: `SELECT c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,
    a.attnotnull,a.attidentity,a.attgenerated,a.attisdropped,a.attstorage,
    cn.nspname AS collation_schema,co.collname AS collation,
    pg_get_expr(d.adbin,d.adrelid) AS default_expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
    WHERE n.nspname='public' AND a.attnum>0 ORDER BY c.relname,a.attnum`,
  constraints: `SELECT c.relname,k.conname,k.contype,k.condeferrable,k.condeferred,k.convalidated,
    pg_get_constraintdef(k.oid,true) AS definition FROM pg_constraint k
    JOIN pg_namespace n ON n.oid=k.connamespace LEFT JOIN pg_class c ON c.oid=k.conrelid
    WHERE n.nspname='public' ORDER BY c.relname,k.conname`,
  indexes: `SELECT c.relname,pg_get_indexdef(c.oid) AS definition,i.indisvalid,i.indisready
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' ORDER BY c.relname`,
  sequences: `SELECT c.relname,format_type(s.seqtypid,NULL) AS type,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle
    FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' ORDER BY c.relname`,
  sequenceOwnership: `SELECT s.relname AS sequence,t.relname AS table_name,a.attname,d.deptype
    FROM pg_depend d JOIN pg_class s ON s.oid=d.objid AND s.relkind='S'
    JOIN pg_namespace n ON n.oid=s.relnamespace JOIN pg_class t ON t.oid=d.refobjid
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
    WHERE n.nspname='public' AND d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass
    ORDER BY s.relname,t.relname,a.attname`,
  triggers: `SELECT c.relname,t.tgisinternal,CASE WHEN NOT t.tgisinternal THEN t.tgname END AS name,
    t.tgenabled,t.tgtype,t.tgdeferrable,t.tginitdeferred,k.conname,
    pn.nspname AS function_schema,p.proname AS function_name,t.tgattr::text,encode(t.tgargs,'hex') AS arguments,
    CASE WHEN NOT t.tgisinternal THEN pg_get_triggerdef(t.oid,true) END AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
    LEFT JOIN pg_constraint k ON k.oid=t.tgconstraint WHERE n.nspname='public'
    ORDER BY c.relname,t.tgisinternal,name,k.conname,pn.nspname,p.proname,t.tgtype`,
  routines: `SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prokind,
    CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) END AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    ORDER BY p.proname,arguments`,
  types: `SELECT t.typname,t.typtype,t.typnotnull,t.typdefault,format_type(t.typbasetype,t.typtypmod) AS base_type,
    ARRAY(SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid=t.oid ORDER BY e.enumsortorder) AS enum_labels
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname`,
  rules: `SELECT c.relname,r.rulename,pg_get_ruledef(r.oid,true) AS definition
    FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' ORDER BY c.relname,r.rulename`,
  policies: `SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
    WHERE schemaname='public' ORDER BY tablename,policyname`,
  extensions: `SELECT e.extname,e.extversion,n.nspname FROM pg_extension e
    JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY e.extname`,
} as const;

async function schemaDefinition(
  db: Queryable,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, sql] of Object.entries(definitionQueries))
    result[key] = (await db.query(sql)).rows;
  return result;
}

export interface LegacyBaselineResult {
  source: string;
  schemaChecksum: string;
  verifiedAt: Date;
  versions: number[];
  referenceDatabase: string;
}

export class LegacyBaselineCleanupError extends Error {
  constructor(
    readonly baseline: LegacyBaselineResult,
    failures: unknown[],
  ) {
    super(
      `Legacy baseline COMMITTED at ${baseline.verifiedAt.toISOString()}; cleanup failed for reference ${baseline.referenceDatabase}. ` +
        "The target was not rolled back. Preserve this baseline evidence and inspect cleanup before continuing; do not re-baseline automatically",
      {
        cause: new AggregateError(
          failures,
          "Legacy baseline reference cleanup failed",
        ),
      },
    );
  }
}

export async function baselineLegacy(
  db: Database,
  databaseUrl: string,
  source: string,
  directory?: URL,
): Promise<LegacyBaselineResult> {
  if (source !== legacyBaselineSource)
    throw new Error(
      `Unsupported legacy source; expected ${legacyBaselineSource}`,
    );
  const migrations = (await loadMigrations(directory)).filter(
    (row) => row.version <= 6,
  );
  if (
    migrations.length !== trustedHistory.length ||
    migrations.some((row, index) => {
      const trusted = trustedHistory[index]!;
      return (
        row.version !== trusted[0] ||
        row.name !== trusted[1] ||
        row.checksum !== trusted[2]
      );
    })
  )
    throw new Error(
      "Legacy baseline source files do not match the fixed trusted release manifest",
    );

  const referenceName = `kapibala_migration_reference_${randomUUID().replaceAll("-", "")}`;
  const referenceUrl = new URL(databaseUrl);
  referenceUrl.pathname = "/postgres";
  referenceUrl.searchParams.set("options", "-csearch_path=public");
  const admin = new Database(referenceUrl.toString());
  let reference: Database | undefined;
  let creationAttempted = false;
  let result: LegacyBaselineResult | undefined;
  const failures: unknown[] = [];
  try {
    // Requires CREATEDB. Failure here cannot mutate the target database.
    creationAttempted = true;
    await admin.query(`CREATE DATABASE ${referenceName} TEMPLATE template0`);
    referenceUrl.pathname = `/${referenceName}`;
    reference = new Database(referenceUrl.toString());
    await reference.transaction(async (tx) => {
      await tx.query(
        "CREATE TABLE schema_migrations(version integer PRIMARY KEY,name text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
      );
      for (const migration of migrations) await tx.query(migration.sql);
    });
    const expected = await schemaDefinition(reference);
    result = await db.transaction(async (tx) => {
      await tx.query("SET LOCAL lock_timeout='5s'");
      await tx.query("SELECT pg_advisory_xact_lock($1)", [migrationLock]);
      await tx.query("SET LOCAL search_path=public");
      // Old services must be stopped first. Hold all known tables against data/DDL
      // writes while comparing and recording the baseline, or fail with no writes.
      const tables = (
        await reference!.query<{
          relname: string;
        }>(`SELECT c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`)
      ).rows;
      for (const table of tables)
        await tx.query(
          `LOCK TABLE public."${table.relname.replaceAll('"', '""')}" IN ACCESS EXCLUSIVE MODE`,
        );
      const applied = (
        await tx.query<{ version: number; name: string }>(
          "SELECT version,name FROM schema_migrations ORDER BY version",
        )
      ).rows;
      if (
        applied.length !== trustedHistory.length ||
        applied.some(
          (row, index) =>
            row.version !== trustedHistory[index]![0] ||
            row.name !== trustedHistory[index]![1],
        )
      )
        throw new Error(
          "Legacy baseline requires the exact complete 001–006 release ledger",
        );
      const actual = await schemaDefinition(tx);
      for (const key of Object.keys(expected))
        if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key]))
          throw new Error(
            `Legacy baseline schema differs from trusted release: ${key}; target left unchanged`,
          );
      const schemaChecksum = createHash("sha256")
        .update(JSON.stringify(actual))
        .digest("hex");
      // The origin explicitly distinguishes observed schema equivalence from
      // proof that these exact historical SQL bytes originally ran.
      await tx.query(`ALTER TABLE schema_migrations
        ADD COLUMN checksum text CHECK(checksum ~ '^[0-9a-f]{64}$'),
        ADD COLUMN checksum_origin text NOT NULL DEFAULT 'executed' CHECK(checksum_origin IN ('executed','legacy_schema_baseline')),
        ADD COLUMN baseline_source text, ADD COLUMN baseline_verified_at timestamptz, ADD COLUMN baseline_schema_checksum text`);
      for (const migration of migrations)
        await tx.query(
          `UPDATE schema_migrations
        SET checksum=$1,checksum_origin='legacy_schema_baseline',baseline_source=$2,baseline_verified_at=now(),baseline_schema_checksum=$3
        WHERE version=$4`,
          [migration.checksum, source, schemaChecksum, migration.version],
        );
      await tx.query(
        "ALTER TABLE schema_migrations ALTER COLUMN checksum SET NOT NULL",
      );
      const verifiedAt = (
        await tx.query<{ verified_at: Date }>(
          "SELECT baseline_verified_at AS verified_at FROM schema_migrations WHERE version=1",
        )
      ).rows[0]!.verified_at;
      return {
        source,
        schemaChecksum,
        verifiedAt,
        versions: migrations.map((row) => row.version),
        referenceDatabase: referenceName,
      };
    });
  } catch (error) {
    failures.push(error);
  }
  try {
    await reference?.close();
  } catch (error) {
    failures.push(error);
  }
  if (creationAttempted)
    try {
      await admin.query(
        `DROP DATABASE IF EXISTS ${referenceName} WITH (FORCE)`,
      );
    } catch (error) {
      failures.push(error);
    }
  try {
    await admin.close();
  } catch (error) {
    failures.push(error);
  }
  if (result && failures.length)
    throw new LegacyBaselineCleanupError(result, failures);
  if (failures.length === 1) throw failures[0];
  if (failures.length)
    throw new AggregateError(
      failures,
      "Legacy baseline or reference database cleanup failed",
    );
  return result!;
}
