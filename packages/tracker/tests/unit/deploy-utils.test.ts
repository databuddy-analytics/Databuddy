import { describe, expect, test } from "bun:test";
import {
	PRODUCTION_SCRIPTS,
	generateSriHash,
	versionedName,
} from "../../deploy-utils";

describe("versionedName", () => {
	test("inserts version before .js extension", () => {
		expect(versionedName("databuddy.js", 1)).toBe("databuddy.v1.js");
		expect(versionedName("databuddy.js", 42)).toBe("databuddy.v42.js");
	});

	test("handles filenames with multiple dots", () => {
		expect(versionedName("databuddy.min.js", 5)).toBe("databuddy.min.v5.js");
	});
});

describe("generateSriHash", () => {
	test("matches known SRI hash for empty string", async () => {
		const hash = await generateSriHash("");
		expect(hash).toBe(
			"sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb"
		);
	});
});

describe("PRODUCTION_SCRIPTS", () => {
	test("does not include debug scripts", () => {
		for (const script of PRODUCTION_SCRIPTS) {
			expect(script).not.toContain("debug");
		}
	});
});
