import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const packageRoot = new URL("../../../", import.meta.url);
const schemaDir = new URL("./", import.meta.url);
const configSource = readFileSync(
	new URL("drizzle.config.ts", packageRoot),
	"utf8"
);

const configEntries = [...configSource.matchAll(/"\.\/src\/drizzle\/schema\/([\w-]+\.ts)"/g)].map(
	(match) => match[1]
);

const tableFiles = readdirSync(schemaDir).filter((file) => {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts")) {
		return false;
	}
	return readFileSync(new URL(file, schemaDir), "utf8").includes("pgTable(");
});

describe("drizzle config schema list", () => {
	test("every table-defining schema file is registered for db:push", () => {
		const missing = tableFiles.filter((file) => !configEntries.includes(file));
		expect(missing).toEqual([]);
	});

	test("every registered schema file exists on disk", () => {
		const stale = configEntries.filter(
			(file) => !existsSync(new URL(file, schemaDir))
		);
		expect(stale).toEqual([]);
	});
});
