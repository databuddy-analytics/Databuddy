import { describe, expect, it } from "bun:test";
import type { DetectedSignal, QueryFn } from "./detection";
import {
	type AnnotationContext,
	type AnnotationQueryFn,
	type EnrichedSignal,
	enrichSignals,
} from "./enrichment";

function makeSignal(overrides: Partial<DetectedSignal> = {}): DetectedSignal {
	return {
		metric: "visitors",
		label: "Visitors",
		method: "zscore",
		direction: "down",
		current: 50,
		baseline: 100,
		deltaPercent: -50,
		zScore: -3.2,
		severity: "critical",
		detectedAt: "2026-05-20",
		...overrides,
	};
}

const BASE_PARAMS = {
	websiteId: "test-site",
	timezone: "UTC",
	lookbackDays: 14,
};

function createMockQueryFn(
	responses: Record<string, Record<string, unknown[]>>
): QueryFn {
	return async (request: { type: string; from: string; to: string }) => {
		const byType = responses[request.type];
		if (!byType) return [];
		const key = `${request.from}:${request.to}`;
		return byType[key] ?? byType["*"] ?? [];
	};
}

function createMockAnnotationFn(
	result: AnnotationContext[] = []
): AnnotationQueryFn {
	return async () => result;
}

describe("enrichSignals", () => {
	it("returns empty array for empty signals", async () => {
		const queryFn = createMockQueryFn({});
		const annotationFn = createMockAnnotationFn();

		const result = await enrichSignals([], BASE_PARAMS, queryFn, annotationFn);
		expect(result).toEqual([]);
	});

	describe("segment decomposition", () => {
		it("finds top movers across dimensions", async () => {
			const signal = makeSignal();

			const queryFn = createMockQueryFn({
				top_pages: {
					"2026-05-20:2026-05-20": [
						{ name: "/home", visitors: 30 },
						{ name: "/about", visitors: 20 },
					],
					"2026-05-07:2026-05-19": [
						{ name: "/home", visitors: 80 },
						{ name: "/about", visitors: 25 },
					],
				},
				country: {
					"2026-05-20:2026-05-20": [{ name: "US", visitors: 20 }],
					"2026-05-07:2026-05-19": [{ name: "US", visitors: 60 }],
				},
				browser_name: { "*": [] },
				top_referrers: { "*": [] },
				error_summary: { "*": [{}] },
				error_types: { "*": [] },
			});

			const result = await enrichSignals(
				[signal],
				BASE_PARAMS,
				queryFn,
				createMockAnnotationFn()
			);

			expect(result).toHaveLength(1);

			const pages = result[0].segments.find((s) => s.dimension === "pages");
			expect(pages).toBeDefined();
			expect(pages!.topMovers.length).toBeGreaterThan(0);

			const homeMover = pages!.topMovers.find((m) => m.name === "/home");
			expect(homeMover).toBeDefined();
			expect(homeMover!.delta).toBe(-50);
			expect(homeMover!.deltaPercent).toBe(-62.5);

			const countries = result[0].segments.find(
				(s) => s.dimension === "countries"
			);
			expect(countries).toBeDefined();
			expect(countries!.topMovers[0].name).toBe("US");
		});

		it("filters out movers with deltaPercent below 10%", async () => {
			const signal = makeSignal();

			const queryFn = createMockQueryFn({
				top_pages: {
					"2026-05-20:2026-05-20": [
						{ name: "/home", visitors: 95 },
						{ name: "/big-change", visitors: 200 },
					],
					"2026-05-07:2026-05-19": [
						{ name: "/home", visitors: 100 },
						{ name: "/big-change", visitors: 50 },
					],
				},
				country: { "*": [] },
				browser_name: { "*": [] },
				top_referrers: { "*": [] },
				error_summary: { "*": [{}] },
				error_types: { "*": [] },
			});

			const result = await enrichSignals(
				[signal],
				BASE_PARAMS,
				queryFn,
				createMockAnnotationFn()
			);

			const pages = result[0].segments.find((s) => s.dimension === "pages");
			expect(pages).toBeDefined();

			const homeMover = pages!.topMovers.find((m) => m.name === "/home");
			expect(homeMover).toBeUndefined();

			const bigChange = pages!.topMovers.find(
				(m) => m.name === "/big-change"
			);
			expect(bigChange).toBeDefined();
			expect(Math.abs(bigChange!.deltaPercent)).toBeGreaterThanOrEqual(10);
		});

		it("returns empty segments when no significant movers exist", async () => {
			const signal = makeSignal();

			const queryFn = createMockQueryFn({
				top_pages: {
					"2026-05-20:2026-05-20": [{ name: "/home", visitors: 100 }],
					"2026-05-07:2026-05-19": [{ name: "/home", visitors: 100 }],
				},
				country: { "*": [] },
				browser_name: { "*": [] },
				top_referrers: { "*": [] },
				error_summary: { "*": [{}] },
				error_types: { "*": [] },
			});

			const result = await enrichSignals(
				[signal],
				BASE_PARAMS,
				queryFn,
				createMockAnnotationFn()
			);

			expect(result[0].segments).toEqual([]);
		});
	});

	describe("error correlation", () => {
		it("attaches error context when errors spike > 20%", async () => {
			const signal = makeSignal();

			const queryFn = createMockQueryFn({
				top_pages: { "*": [] },
				country: { "*": [] },
				browser_name: { "*": [] },
				top_referrers: { "*": [] },
				error_summary: {
					"2026-05-20:2026-05-20": [{ totalErrors: 150 }],
					"2026-05-07:2026-05-19": [{ totalErrors: 100 }],
				},
				error_types: {
					"2026-05-20:2026-05-20": [
						{ name: "TypeError", count: 80 },
						{ name: "RangeError", count: 40 },
						{ name: "NetworkError", count: 30 },
					],
					"2026-05-07:2026-05-19": [
						{ name: "TypeError", count: 50 },
						{ name: "RangeError", count: 40 },
					],
				},
			});

			const result = await enrichSignals(
				[signal],
				BASE_PARAMS,
				queryFn,
				createMockAnnotationFn()
			);

			expect(result[0].errorContext).toBeDefined();
			expect(result[0].errorContext!.totalErrorsCurrent).toBe(150);
			expect(result[0].errorContext!.totalErrorsPrevious).toBe(100);
			expect(result[0].errorContext!.deltaPercent).toBe(50);
		});

		it("does NOT attach error context when change is < 20%", async () => {
			const signal = makeSignal();

			const queryFn = createMockQueryFn({
				top_pages: { "*": [] },
				country: { "*": [] },
				browser_name: { "*": [] },
				top_referrers: { "*": [] },
				error_summary: {
					"2026-05-20:2026-05-20": [{ totalErrors: 110 }],
					"2026-05-07:2026-05-19": [{ totalErrors: 100 }],
				},
				error_types: { "*": [] },
			});

			const result = await enrichSignals(
				[signal],
				BASE_PARAMS,
				queryFn,
				createMockAnnotationFn()
			);

			expect(result[0].errorContext).toBeUndefined();
		});

		it("identifies new errors that appeared in current period", async () => {
			const signal = makeSignal();

			const queryFn = createMockQueryFn({
				top_pages: { "*": [] },
				country: { "*": [] },
				browser_name: { "*": [] },
				top_referrers: { "*": [] },
				error_summary: {
					"2026-05-20:2026-05-20": [{ totalErrors: 200 }],
					"2026-05-07:2026-05-19": [{ totalErrors: 80 }],
				},
				error_types: {
					"2026-05-20:2026-05-20": [
						{ name: "TypeError", count: 100 },
						{ name: "NewCrash", count: 60 },
						{ name: "AnotherNew", count: 40 },
					],
					"2026-05-07:2026-05-19": [{ name: "TypeError", count: 80 }],
				},
			});

			const result = await enrichSignals(
				[signal],
				BASE_PARAMS,
				queryFn,
				createMockAnnotationFn()
			);

			expect(result[0].errorContext).toBeDefined();
			expect(result[0].errorContext!.topNewErrors).toContain("NewCrash");
			expect(result[0].errorContext!.topNewErrors).toContain("AnotherNew");
			expect(result[0].errorContext!.topNewErrors).not.toContain("TypeError");
		});

		it("identifies spiked errors with biggest increase", async () => {
			const signal = makeSignal();

			const queryFn = createMockQueryFn({
				top_pages: { "*": [] },
				country: { "*": [] },
				browser_name: { "*": [] },
				top_referrers: { "*": [] },
				error_summary: {
					"2026-05-20:2026-05-20": [{ totalErrors: 300 }],
					"2026-05-07:2026-05-19": [{ totalErrors: 100 }],
				},
				error_types: {
					"2026-05-20:2026-05-20": [
						{ name: "TypeError", count: 150 },
						{ name: "RangeError", count: 100 },
						{ name: "SyntaxError", count: 50 },
					],
					"2026-05-07:2026-05-19": [
						{ name: "TypeError", count: 30 },
						{ name: "RangeError", count: 20 },
						{ name: "SyntaxError", count: 50 },
					],
				},
			});

			const result = await enrichSignals(
				[signal],
				BASE_PARAMS,
				queryFn,
				createMockAnnotationFn()
			);

			const ctx = result[0].errorContext!;
			expect(ctx.topSpikedErrors).toContain("TypeError");
			expect(ctx.topSpikedErrors).toContain("RangeError");
			expect(ctx.topSpikedErrors).not.toContain("SyntaxError");
			expect(ctx.topSpikedErrors[0]).toBe("TypeError");
		});
	});

	describe("annotation lookup", () => {
		it("includes annotations within the time window", async () => {
			const signal = makeSignal();

			const queryFn = createMockQueryFn({
				top_pages: { "*": [] },
				country: { "*": [] },
				browser_name: { "*": [] },
				top_referrers: { "*": [] },
				error_summary: { "*": [{}] },
				error_types: { "*": [] },
			});

			const annotationFn = createMockAnnotationFn([
				{
					id: "ann-1",
					title: "Deploy v2.3.1",
					date: "2026-05-19",
					tags: ["deploy"],
				},
				{
					id: "ann-2",
					title: "Marketing campaign",
					date: "2026-05-18",
					tags: ["marketing"],
				},
			]);

			const result = await enrichSignals(
				[signal],
				BASE_PARAMS,
				queryFn,
				annotationFn
			);

			expect(result[0].annotations).toHaveLength(2);
			expect(result[0].annotations[0].id).toBe("ann-1");
			expect(result[0].annotations[1].tags).toContain("marketing");
		});
	});

	describe("time window computation", () => {
		it("uses single-day current window for zscore signals", async () => {
			const signal = makeSignal({ method: "zscore", detectedAt: "2026-05-20" });
			const calls: { type: string; from: string; to: string }[] = [];

			const queryFn: QueryFn = async (request: {
				type: string;
				from: string;
				to: string;
			}) => {
				calls.push({
					type: request.type,
					from: request.from,
					to: request.to,
				});
				return [];
			};

			await enrichSignals(
				[signal],
				BASE_PARAMS,
				queryFn,
				createMockAnnotationFn()
			);

			const pagesCurrent = calls.find(
				(c) => c.type === "top_pages" && c.from === "2026-05-20"
			);
			expect(pagesCurrent).toBeDefined();
			expect(pagesCurrent!.to).toBe("2026-05-20");
		});

		it("uses full-lookback windows for wow signals", async () => {
			const signal = makeSignal({ method: "wow", detectedAt: "2026-05-20" });
			const calls: { type: string; from: string; to: string }[] = [];

			const queryFn: QueryFn = async (request: {
				type: string;
				from: string;
				to: string;
			}) => {
				calls.push({
					type: request.type,
					from: request.from,
					to: request.to,
				});
				return [];
			};

			await enrichSignals(
				[signal],
				BASE_PARAMS,
				queryFn,
				createMockAnnotationFn()
			);

			const pagesCalls = calls.filter((c) => c.type === "top_pages");
			expect(pagesCalls.length).toBe(2);

			const currentCall = pagesCalls.find((c) => c.to === "2026-05-20");
			expect(currentCall).toBeDefined();
			expect(currentCall!.from).toBe("2026-05-07");

			const previousCall = pagesCalls.find((c) => c.to !== "2026-05-20");
			expect(previousCall).toBeDefined();
			expect(previousCall!.to).toBe("2026-05-06");
		});
	});
});
