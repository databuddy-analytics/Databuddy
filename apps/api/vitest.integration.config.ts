import { defineConfig } from "vitest/config";

export default defineConfig({
	ssr: {
		noExternal: ["zod"],
	},
	test: {
		fileParallelism: false,
		include: ["src/integration/**/*.test.ts"],
		alias: {
			"@/": new URL("./src/", import.meta.url).pathname,
		},
	},
});
