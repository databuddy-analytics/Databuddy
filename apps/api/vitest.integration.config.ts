import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/integration/**/*.test.ts"],
		alias: {
			"@/": new URL("./src/", import.meta.url).pathname,
		},
	},
});
