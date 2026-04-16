import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@lib": resolve(import.meta.dirname, "src/lib"),
			"@utils": resolve(import.meta.dirname, "src/utils"),
			"@hooks": resolve(import.meta.dirname, "src/hooks"),
			"@routes": resolve(import.meta.dirname, "src/routes"),
			"@types": resolve(import.meta.dirname, "src/types"),
		},
	},
	test: {
		include: ["src/**/*.test.ts"],
		setupFiles: ["./vitest.setup.ts"],
	},
});
