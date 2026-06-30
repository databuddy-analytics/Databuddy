import {
	AGENT_TABLE_COLUMNS,
	AGENT_TENANT_COLUMN_BY_TABLE,
} from "@databuddy/db/clickhouse";
import { tool } from "ai";
import { z } from "zod";

interface TableSchema {
	columns: string[];
	name: string;
	tenantColumn: string;
}

const TABLES: TableSchema[] = Object.keys(AGENT_TENANT_COLUMN_BY_TABLE)
	.sort()
	.map((name) => ({
		name,
		tenantColumn: AGENT_TENANT_COLUMN_BY_TABLE[name] as string,
		columns: [...(AGENT_TABLE_COLUMNS[name] ?? new Set())].sort(),
	}));

const TABLE_NAMES = TABLES.map((t) => t.name);

export const describeSchemaTool = tool({
	description: `Look up the columns and tenant column for an allowlisted ClickHouse table before writing execute_sql_query. Returns { name, tenantColumn, columns }. Use this when you're unsure which column carries the websiteId on a given table — the answer is authoritative because the validator uses the same source.`,
	inputSchema: z.object({
		table: z
			.enum([TABLE_NAMES[0] ?? "analytics.events", ...TABLE_NAMES.slice(1)] as [
				string,
				...string[],
			])
			.optional()
			.describe(
				`Table to describe. Omit to list all allowlisted tables. Available: ${TABLE_NAMES.join(", ")}.`
			),
	}),
	execute: ({ table }) => {
		if (table) {
			const match = TABLES.find((t) => t.name === table);
			return match
				? { table: match }
				: {
						error: `Unknown table "${table}". Allowed: ${TABLE_NAMES.join(", ")}.`,
					};
		}
		return { tables: TABLES };
	},
});
