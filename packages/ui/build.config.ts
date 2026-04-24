import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	name: "@databuddy/ui",
	entries: ["./src/index.ts"],
	externals: [
		"react",
		"react-dom",
		"@base-ui-components/react/tabs",
		"@radix-ui/react-slot",
	],
	rollup: {
		emitCJS: false,
		esbuild: {
			jsx: "automatic",
			minify: false,
		},
	},
	declaration: true,
});
