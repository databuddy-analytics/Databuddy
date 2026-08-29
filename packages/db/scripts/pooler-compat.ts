import { db, shutdownPostgres } from "../src/index";
import { sql } from "drizzle-orm";

const result = await db.execute(sql`SHOW statement_timeout`);
interface StatementTimeoutRow {
	statement_timeout?: string;
}

const rows = (result as { rows?: StatementTimeoutRow[] }).rows ?? [];
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
