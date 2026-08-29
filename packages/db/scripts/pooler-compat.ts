import { db, shutdownPostgres } from "../src/index";
import { sql } from "drizzle-orm";

const result = await db.execute(sql`SHOW statement_timeout`);
const rows = (result as { rows?: Record<string, unknown>[] }).rows ?? [];
const timeout = rows[0]?.statement_timeout;
if (!timeout || timeout === "0") {
	console.error(
		`pooler-compat: statement_timeout not applied (got ${String(timeout)})`
	);
	process.exit(1);
}
console.log(
	`pooler-compat: connected through pooler, statement_timeout=${String(timeout)}`
);
await shutdownPostgres();
process.exit(0);
