import { defineConfig } from "drizzle-kit";

export default defineConfig({
	out: "./src/drizzle",
	schema: [
		"./src/drizzle/schema/admin.ts",
		"./src/drizzle/schema/agent.ts",
		"./src/drizzle/schema/analytics.ts",
		"./src/drizzle/schema/api-keys.ts",
		"./src/drizzle/schema/auth.ts",
		"./src/drizzle/schema/billing.ts",
		"./src/drizzle/schema/feedback.ts",
		"./src/drizzle/schema/flags.ts",
		"./src/drizzle/schema/insights.ts",
		"./src/drizzle/schema/integrations.ts",
		"./src/drizzle/schema/links.ts",
		"./src/drizzle/schema/tracker.ts",
		"./src/drizzle/schema/uptime.ts",
		"./src/drizzle/schema/websites.ts",
	],
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL || "",
	},
	tablesFilter: ["!pg_stat_statements", "!pg_stat_statements_info"],
});
