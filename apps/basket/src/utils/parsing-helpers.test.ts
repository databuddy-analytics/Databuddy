import { describe, expect, test } from "vitest";
import { cases, longString } from "../test-helpers";
import {
	parseEventId,
	parseProperties,
	parseTimestamp,
} from "./parsing-helpers";

cases(
	"parseTimestamp keeps numeric timestamps verbatim",
	[
		["positive epoch", 1_700_000_000, 1_700_000_000],
		["zero", 0, 0],
		["negative", -1, -1],
	],
	(input) => parseTimestamp(input)
);

describe("parseTimestamp replaces non-numeric input with the current time", () => {
	test.each([["not-a-number"], [null], [undefined], [{}]])(
		"%j falls back to Date.now()",
		(input) => {
			const before = Date.now();
			const result = parseTimestamp(input);
			expect(result).toBeGreaterThanOrEqual(before);
			expect(result).toBeLessThanOrEqual(Date.now());
		}
	);
});

cases(
	"parseProperties serializes truthy values and defaults the rest",
	[
		["object", { a: 1 }, '{"a":1}'],
		["nested object", { a: { b: "c" } }, '{"a":{"b":"c"}}'],
		["array", [1, 2], "[1,2]"],
		["non-empty string", "hello", '"hello"'],
		["null", null, "{}"],
		["undefined", undefined, "{}"],
		["empty string", "", "{}"],
	],
	(input) => parseProperties(input)
);

describe("parseEventId", () => {
	const gen = () => "generated-uuid";

	cases(
		"keeps client ids and generates for unusable input",
		[
			["valid string", "evt_123", "evt_123"],
			["empty string", "", "generated-uuid"],
			["null", null, "generated-uuid"],
			["number", 123, "generated-uuid"],
		],
		(input) => parseEventId(input, gen)
	);

	test("truncated a long id to the event id limit", () => {
		expect(parseEventId(longString(600), gen).length).toBe(512);
	});
});
