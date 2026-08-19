import { describe, expect, test } from "bun:test";
import { buildFlagChangeSnapshot } from "./flags";

describe("buildFlagChangeSnapshot", () => {
	test("normalizes nullable flag fields for every writer", () => {
		const snapshot = buildFlagChangeSnapshot({
			defaultValue: false,
			dependencies: null,
			description: null,
			environment: null,
			key: "checkout-v2",
			name: null,
			persistAcrossAuth: false,
			rolloutBy: null,
			rolloutPercentage: null,
			status: "active",
			type: "boolean",
			variants: null,
		});

		expect(snapshot).toEqual({
			defaultValue: false,
			dependencies: [],
			description: null,
			environment: null,
			key: "checkout-v2",
			name: null,
			persistAcrossAuth: false,
			rolloutBy: null,
			rolloutPercentage: null,
			status: "active",
			type: "boolean",
			variants: [],
		});
	});
});
