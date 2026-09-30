import { Database } from "../../apps/server/src/core/db.js";
import { migrate } from "../../apps/server/src/core/migrations.js";

const db = new Database(process.env.DATABASE_URL!);
try {
  await migrate(db, new URL(process.argv[2]!));
} finally {
  await db.close();
}
