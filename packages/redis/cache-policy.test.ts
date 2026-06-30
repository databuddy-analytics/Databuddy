import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "bun:test";

const ROOT = resolve(import.meta.dir, "../..");
const sourceFiles = new Bun.Glob("{apps,packages}/**/*.{ts,tsx}");
const ignoredPath = /(^|\/)(node_modules|dist|coverage|\.next)\//;
const allowedPath = /^packages\/redis\/|\.(test|spec)\.tsx?$/;

const forbidden = [
	[/cacheable:[^`'"\n]*\$\{/, "raw cacheable key pattern"],
	[
		/\binvalidateCacheable(?:Key|Pattern|Prefix|Tag|Tags|WithArgs)\s*\(/,
		"low-level cache invalidation primitive",
	],
] as const;

describe("cache invalidation policy", () => {
	it("keeps low-level cache invalidation primitives inside @databuddy/redis", async () => {
		const violations: string[] = [];

		for await (const file of sourceFiles.scan({ cwd: ROOT, onlyFiles: true })) {
			if (ignoredPath.test(file) || allowedPath.test(file)) {
				continue;
			}

			const contents = await readFile(resolve(ROOT, file), "utf8");
			for (const [pattern, name] of forbidden) {
				if (pattern.test(contents)) {
					violations.push(`${file}: ${name}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});
});
