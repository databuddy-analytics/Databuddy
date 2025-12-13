import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	name: "@databuddy/cache",
	entries: ["./src/drizzle.ts"],
	externals: ["drizzle-orm"],
	declaration: true,
});
