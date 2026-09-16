import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		server: { deps: { inline: ["zod"] } },
		include: ["src/**/*.test.ts"],
		exclude: ["src/integration/**"],
		alias: {
			"@/": new URL("./src/", import.meta.url).pathname,
		},
	},
});
