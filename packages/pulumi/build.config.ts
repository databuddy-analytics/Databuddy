import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	name: "@databuddy/pulumi",
	entries: ["./src/index.ts"],
	externals: ["@pulumi/pulumi"],
	rollup: {
		emitCJS: true,
	},
	declaration: true,
});
