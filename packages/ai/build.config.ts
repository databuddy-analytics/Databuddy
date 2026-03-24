import { resolve } from "node:path";
import { defineBuildConfig } from "unbuild";

const banner = `/**
 * @databuddy/ai - LLM Observability SDK
 * https://databuddy.cc
 * (c) ${new Date().getFullYear()} Databuddy
 * @license MIT
 */`;

export default defineBuildConfig({
	name: "@databuddy/ai",
	entries: [
		"./src/vercel/index.ts",
		"./src/openai/index.ts",
		"./src/anthropic/index.ts",
	],
	externals: [
		"@ai-sdk/provider",
		"@anthropic-ai/sdk",
		"ai",
		"openai",
		"tokenlens",
		"uuid",
	],
	rollup: {
		emitCJS: false,
		esbuild: {
			minify: true,
		},
		output: {
			banner,
		},
	},
	declaration: true,
	alias: {
		"@": resolve(import.meta.dirname, "src"),
	},
});
