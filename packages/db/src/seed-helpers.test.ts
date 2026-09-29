import { faker } from "@faker-js/faker";
import { describe, expect, test } from "bun:test";
import {
	extractFlag,
	nextPath,
	resolveSeedValue,
	START_TRANSITIONS,
} from "./seed-helpers";

describe("extractFlag", () => {
	test("reads a space-separated flag and removes it from args", () => {
		const args = ["site-1", "--seed", "7", "500"];
		expect(extractFlag(args, "seed")).toBe("7");
		expect(args).toEqual(["site-1", "500"]);
	});

	test("reads an equals-separated flag and removes it from args", () => {
		const args = ["site-1", "--seed=7", "500"];
		expect(extractFlag(args, "seed")).toBe("7");
		expect(args).toEqual(["site-1", "500"]);
	});

	test("returns undefined and leaves args untouched when the flag is absent", () => {
		const args = ["site-1", "500"];
		expect(extractFlag(args, "seed")).toBeUndefined();
		expect(args).toEqual(["site-1", "500"]);
	});
});

describe("resolveSeedValue", () => {
	test("defaults to 42 when no seed argument was given", () => {
		expect(resolveSeedValue(undefined)).toBe(42);
	});

	test("defaults to 42 for a blank or non-numeric argument", () => {
		expect(resolveSeedValue("")).toBe(42);
		expect(resolveSeedValue("not-a-number")).toBe(42);
	});

	test("parses a numeric seed argument", () => {
		expect(resolveSeedValue("7")).toBe(7);
	});
});

describe("nextPath", () => {
	test("is deterministic for a given faker seed", () => {
		faker.seed(123);
		const firstRun = Array.from({ length: 20 }, (_, i) =>
			nextPath(i === 0 ? undefined : "/pricing", "/")
		);

		faker.seed(123);
		const secondRun = Array.from({ length: 20 }, (_, i) =>
			nextPath(i === 0 ? undefined : "/pricing", "/")
		);

		expect(secondRun).toEqual(firstRun);
	});

	test("only returns paths reachable from the given page", () => {
		faker.seed(1);
		for (let i = 0; i < 50; i++) {
			const path = nextPath("/signup", "/");
			expect(["/dashboard", "/pricing", "/login", "/"]).toContain(path);
		}
	});

	test("falls back to the start transitions for an unknown page", () => {
		faker.seed(1);
		const startPaths = new Set(START_TRANSITIONS.map((entry) => entry.path));
		const path = nextPath("/not-a-real-page", "/");
		expect(startPaths.has(path)).toBe(true);
	});

	test("produces a meaningfully higher pricing -> signup rate than a uniform random pick", () => {
		faker.seed(99);
		const samples = 2000;
		let signupCount = 0;
		for (let i = 0; i < samples; i++) {
			if (nextPath("/pricing", "/") === "/signup") {
				signupCount++;
			}
		}
		// /pricing -> /signup is weighted 45 of 100; a uniform pick across the
		// ~6 reachable pages here would land near 17%, not 45%.
		expect(signupCount / samples).toBeGreaterThan(0.35);
	});
});
