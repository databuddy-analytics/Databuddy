import { describe, expect, test } from "bun:test";
import { MonitorStatus } from "./types";
import { resolveTransitionKind } from "./uptime-transition-alerts";

const { UP, DOWN, PENDING, MAINTENANCE } = MonitorStatus;

describe("resolveTransitionKind — happy path transitions", () => {
	test("fresh monitor going UP is silent", () => {
		expect(resolveTransitionKind(undefined, UP)).toBeNull();
	});

	test("fresh monitor going DOWN fires a down alert", () => {
		expect(resolveTransitionKind(undefined, DOWN)).toBe("down");
	});

	test("UP → DOWN fires a down alert", () => {
		expect(resolveTransitionKind(UP, DOWN)).toBe("down");
	});

	test("DOWN → UP fires a recovered alert", () => {
		expect(resolveTransitionKind(DOWN, UP)).toBe("recovered");
	});
});

describe("resolveTransitionKind — dedupe invariants", () => {
	test("DOWN → DOWN is silent (no duplicate down alerts)", () => {
		expect(resolveTransitionKind(DOWN, DOWN)).toBeNull();
	});

	test("UP → UP is silent", () => {
		expect(resolveTransitionKind(UP, UP)).toBeNull();
	});

	test("repeated DOWN checks stay silent across many calls", () => {
		for (let i = 0; i < 50; i += 1) {
			expect(resolveTransitionKind(DOWN, DOWN)).toBeNull();
		}
	});
});

describe("resolveTransitionKind — intermediate states", () => {
	test("PENDING → DOWN fires a down alert (first real signal is failure)", () => {
		expect(resolveTransitionKind(PENDING, DOWN)).toBe("down");
	});

	test("PENDING → UP is silent (no prior DOWN to recover from)", () => {
		expect(resolveTransitionKind(PENDING, UP)).toBeNull();
	});

	test("MAINTENANCE → UP is silent (not a recovery event)", () => {
		expect(resolveTransitionKind(MAINTENANCE, UP)).toBeNull();
	});

	test("MAINTENANCE → DOWN fires a down alert", () => {
		expect(resolveTransitionKind(MAINTENANCE, DOWN)).toBe("down");
	});

	test("any → PENDING is silent (not a user-facing transition)", () => {
		expect(resolveTransitionKind(UP, PENDING)).toBeNull();
		expect(resolveTransitionKind(DOWN, PENDING)).toBeNull();
		expect(resolveTransitionKind(undefined, PENDING)).toBeNull();
	});

	test("any → MAINTENANCE is silent", () => {
		expect(resolveTransitionKind(UP, MAINTENANCE)).toBeNull();
		expect(resolveTransitionKind(DOWN, MAINTENANCE)).toBeNull();
		expect(resolveTransitionKind(undefined, MAINTENANCE)).toBeNull();
	});
});

describe("resolveTransitionKind — defensive inputs", () => {
	test("unknown numeric current status is silent", () => {
		expect(resolveTransitionKind(DOWN, 99)).toBeNull();
		expect(resolveTransitionKind(UP, -1)).toBeNull();
	});

	test("NaN current never fires", () => {
		expect(resolveTransitionKind(DOWN, Number.NaN)).toBeNull();
		expect(resolveTransitionKind(UP, Number.NaN)).toBeNull();
	});

	test("NaN previous with DOWN current still alerts (prev !== DOWN)", () => {
		expect(resolveTransitionKind(Number.NaN, DOWN)).toBe("down");
	});
});

describe("resolveTransitionKind — state machine matrix", () => {
	const states = [undefined, UP, DOWN, PENDING, MAINTENANCE] as const;
	const expected: Record<string, "down" | "recovered" | null> = {
		"undefined→0": "down",
		"undefined→1": null,
		"undefined→2": null,
		"undefined→3": null,
		"1→0": "down",
		"1→1": null,
		"1→2": null,
		"1→3": null,
		"0→0": null,
		"0→1": "recovered",
		"0→2": null,
		"0→3": null,
		"2→0": "down",
		"2→1": null,
		"2→2": null,
		"2→3": null,
		"3→0": "down",
		"3→1": null,
		"3→2": null,
		"3→3": null,
	};

	for (const prev of states) {
		for (const curr of states) {
			if (curr === undefined) {
				continue;
			}
			const key = `${prev === undefined ? "undefined" : prev}→${curr}`;
			test(`${key} → ${expected[key]}`, () => {
				expect(resolveTransitionKind(prev, curr)).toBe(expected[key]);
			});
		}
	}
});
