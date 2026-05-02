import { describe, expect, test } from "bun:test";
import {
	PRODUCTION_SCRIPTS,
	generateSriHash,
	getContentHash,
	versionedName,
} from "../../deploy-utils";

describe("versionedName", () => {
	test("inserts version before .js extension", () => {
		expect(versionedName("databuddy.js", 1)).toBe("databuddy.v1.js");
		expect(versionedName("databuddy.js", 42)).toBe("databuddy.v42.js");
	});

	test("handles filenames with hyphens", () => {
		expect(versionedName("databuddy-debug.js", 3)).toBe(
			"databuddy-debug.v3.js"
		);
	});

	test("handles filenames with multiple dots", () => {
		expect(versionedName("databuddy.min.js", 5)).toBe("databuddy.min.v5.js");
	});
});

describe("getContentHash", () => {
	test("returns consistent hash for same content", () => {
		const hash1 = getContentHash("hello world");
		const hash2 = getContentHash("hello world");
		expect(hash1).toBe(hash2);
	});

	test("returns different hash for different content", () => {
		const hash1 = getContentHash("hello world");
		const hash2 = getContentHash("hello world!");
		expect(hash1).not.toBe(hash2);
	});

	test("returns a numeric string", () => {
		const hash = getContentHash("test content");
		expect(hash).toMatch(/^\d+$/);
	});
});

describe("generateSriHash", () => {
	test("returns sha384 prefixed hash", async () => {
		const hash = await generateSriHash("console.log('hello')");
		expect(hash).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);
	});

	test("returns consistent hash for same content", async () => {
		const content = "var x = 1;";
		const hash1 = await generateSriHash(content);
		const hash2 = await generateSriHash(content);
		expect(hash1).toBe(hash2);
	});

	test("returns different hash for different content", async () => {
		const hash1 = await generateSriHash("var x = 1;");
		const hash2 = await generateSriHash("var x = 2;");
		expect(hash1).not.toBe(hash2);
	});

	test("produces a valid base64 payload", async () => {
		const hash = await generateSriHash("test");
		const base64Part = hash.replace("sha384-", "");
		const decoded = atob(base64Part);
		expect(decoded.length).toBe(48);
	});

	test("matches known SRI hash for empty string", async () => {
		const hash = await generateSriHash("");
		expect(hash).toBe(
			"sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb"
		);
	});
});

describe("PRODUCTION_SCRIPTS", () => {
	test("contains the three production scripts", () => {
		expect(PRODUCTION_SCRIPTS).toEqual([
			"databuddy.js",
			"vitals.js",
			"errors.js",
		]);
	});

	test("does not include debug scripts", () => {
		for (const script of PRODUCTION_SCRIPTS) {
			expect(script).not.toContain("debug");
		}
	});
});
