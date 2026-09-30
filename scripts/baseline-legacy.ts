import "dotenv/config";
import { Database } from "../apps/server/src/core/db.js";
import {
  baselineLegacy,
  legacyBaselineSource,
  LegacyBaselineCleanupError,
} from "../apps/server/src/core/legacy-migration-baseline.js";

if (
  process.argv.length !== 3 ||
  process.argv[2] !== `--source=${legacyBaselineSource}`
)
  throw new Error(
    `Stop the old service and use: npx tsx scripts/baseline-legacy.ts --source=${legacyBaselineSource}`,
  );
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL is required for explicit legacy baseline verification",
  );
const db = new Database(process.env.DATABASE_URL);
try {
  const evidence = await baselineLegacy(
    db,
    process.env.DATABASE_URL,
    legacyBaselineSource,
  );
  console.log(
    JSON.stringify({
      ...evidence,
      protection:
        "History integrity protection begins at this verified schema baseline; past SQL execution bytes remain unproven",
      next: "Run npm run db:migrate separately after checking any pending migration preconditions",
    }),
  );
} catch (error) {
  if (error instanceof LegacyBaselineCleanupError)
    console.error(
      JSON.stringify({
        targetCommitted: true,
        cleanupFailed: true,
        ...error.baseline,
      }),
    );
  throw error;
} finally {
  await db.close();
}
