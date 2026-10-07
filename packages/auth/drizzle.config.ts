import { dataUrl } from "@databuddy/env/app";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	out: "./drizzle",
	schema: "./src/drizzle/schema.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: dataUrl("DATABASE_URL") || "",
	},
});
