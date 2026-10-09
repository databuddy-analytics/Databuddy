import { AGENT_TABLE_COLUMNS } from "@databuddy/db/clickhouse";
import { tool } from "ai";
import { z } from "zod";
import { ANALYTICS_TABLES } from "../prompts/clickhouse-schema";

const COLUMN_DOC_PATTERN = /^(\w+)(?: \((.+?)\))?(?: - (.+))?$/;

const TABLES = ANALYTICS_TABLES.filter(
	(table) => table.name in AGENT_TABLE_COLUMNS
)
	.sort((a, b) => a.name.localeCompare(b.name))
	.map((table) => ({
		name: table.name,
		description: table.description,
		columns: table.keyColumns.flatMap((doc) => {
			const [, name = doc, type, note] = doc.match(COLUMN_DOC_PATTERN) ?? [];
			return AGENT_TABLE_COLUMNS[table.name]?.has(name)
				? [{ name, type, note }]
				: [];
		}),
		notes: table.additionalInfo,
	}));

const TABLE_LIST = TABLES.map(({ name, columns }) => ({
	name,
	columns: columns.map((column) => column.name),
}));

export const describeSchemaTool = tool({
	description:
		"Columns with types and notes for an allowlisted ClickHouse table. Notes carry counting rules ClickHouse cannot check, so read a table's entry before querying it with execute_sql_query.",
	inputSchema: z.object({
		table: z
			.enum(TABLES.map((t) => t.name) as [string, ...string[]])
			.optional()
			.describe("Table to describe. Omit to list every table's columns."),
	}),
	execute: ({ table }) => {
		const match = TABLES.find((t) => t.name === table);
		return match ? { table: match } : { tables: TABLE_LIST };
	},
});
