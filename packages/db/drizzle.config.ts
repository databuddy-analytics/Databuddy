import { defineConfig } from "drizzle-kit";

export default defineConfig({
	out: "./packages/db/src/drizzle",
	schema: "./packages/db/src/drizzle/schema.ts",
	dialect: "postgresql",
	dbCredentials: {
		// Bun automatically populates process.env from your .env file
		url: process.env.DATABASE_URL!,
	},
	tablesFilter: ["!pg_stat_statements", "!pg_stat_statements_info"],
});