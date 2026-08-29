import { sql } from "drizzle-orm";
import { db, shutdownPostgres } from "../src/index";

const result = await db.execute(sql`SHOW statement_timeout`);
const rows = Array.isArray(result) ? result : result.rows;
const rawTimeout = rows?.[0]?.statement_timeout;
const timeout = typeof rawTimeout === "string" ? rawTimeout : undefined;

if (!timeout || timeout === "0") {
	process.stderr.write(
		`pooler-compat: statement_timeout not applied (got ${String(rawTimeout)})\n`
	);
	process.exit(1);
}
process.stdout.write(
	`pooler-compat: connected through pooler, statement_timeout=${timeout}\n`
);
await shutdownPostgres();
process.exit(0);
