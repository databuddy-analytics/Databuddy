import { describe, expect, it } from "bun:test";
import { compileQuery } from "@databuddy/ai/query";
import dayjs from "dayjs";
import {
	detectSignals,
	type DetectionDiagnostics,
	type QueryFn,
} from "./detection";

const params = {
	websiteId: "synthetic-site",
	lookbackDays: 7,
	timezone: "UTC",
};
const today = dayjs("2026-09-29T12:00:00Z");
const targetName = "Synthetic checkout error";

function error(name: string, count = 100, users = 20, sessions = users) {
	return { name, count, users, sessions };
}

function fillers(users: number) {
	return Array.from({ length: 50 }, (_, index) =>
		error(`Synthetic error ${index}`, 100, users)
	);
}

function queryErrors(
	current: ReturnType<typeof error>[],
	previous: ReturnType<typeof error>[],
	failFilteredRead = false
) {
	const requests: Parameters<QueryFn>[0][] = [];
	const query: QueryFn = async (request) => {
		requests.push(request);
		if (request.type === "summary_metrics") {
			return [{ sessions: 1000 }];
		}
		if (request.type !== "error_fingerprints") {
			return [];
		}
		let rows = request.from === "2026-09-22" ? current : previous;
		const names = request.filters?.find((filter) => filter.field === "message");
		if (names) {
			if (failFilteredRead && request.from === "2026-09-15") {
				throw new Error("Synthetic exact-read failure");
			}
			expect(names.op).toBe("in");
			expect(Array.isArray(names.value)).toBe(true);
			const wanted = new Set(names.value as string[]);
			expect(wanted.size).toBeLessThanOrEqual(50);
			rows = rows.filter((row) => wanted.has(row.name));
		}
		return [...rows]
			.sort((left, right) => right.users - left.users)
			.slice(0, Math.min(request.limit ?? 20, 50));
	};
	return { query, requests };
}

function errorSignals(signals: Awaited<ReturnType<typeof detectSignals>>) {
	return signals.filter((signal) => signal.metric === "error_count");
}

describe("complete error fingerprint comparisons", () => {
	it("compiles bounded exact-message reads through the native SQL contract", () => {
		const names = [
			"Synthetic quote ' and slash \\",
			"Synthetic unicode \u03bb error",
			...Array.from({ length: 48 }, (_, index) => `Synthetic error ${index}`),
		];
		const { params: queryParams, sql } = compileQuery({
			projectId: params.websiteId,
			type: "error_fingerprints",
			from: "2026-09-15",
			to: "2026-09-21",
			filters: [{ field: "message", op: "in", value: names }],
			limit: 1000,
		});

		expect(queryParams.f0).toEqual(names);
		expect(queryParams.limit).toBe(50);
		expect(sql).toContain("message IN {f0:Array(String)}");
		expect(sql.indexOf("message IN {f0:Array(String)}")).toBeLessThan(
			sql.indexOf("GROUP BY es.message")
		);
		expect(sql).not.toContain(names[0]);
		expect(sql).toContain("LIMIT {limit:UInt32}");
	});

	it.each([
		"enters",
		"leaves",
	] as const)("does not invent a change when a stable fingerprint %s the top 50", async (movement) => {
		const withTarget = [error(targetName), ...fillers(19)];
		const withoutTarget = [error(targetName), ...fillers(21)];
		const { query, requests } = queryErrors(
			movement === "enters" ? withTarget : withoutTarget,
			movement === "enters" ? withoutTarget : withTarget
		);
		const signals = await detectSignals(params, query, today);
		expect(errorSignals(signals)).toEqual([]);
		const reads = requests.filter(
			(request) => request.type === "error_fingerprints"
		);
		expect(reads).toHaveLength(4);
		expect(reads.filter((request) => request.filters)).toHaveLength(2);
	});

	it("keeps the measured baseline when a regressing fingerprint enters the top 50", async () => {
		const { query } = queryErrors(
			[error(targetName, 100), ...fillers(19)],
			[error(targetName, 20), ...fillers(21)]
		);
		const signals = await detectSignals(params, query, today);
		expect(errorSignals(signals)).toMatchObject([
			{ entityId: targetName, baseline: 20, current: 100, deltaPercent: 400 },
		]);
	});

	it.each([
		9, 10,
	])("uses session reach for a completed low-user counterpart: %s", async (sessions) => {
		const { query } = queryErrors(
			[error(targetName, 100, 5, sessions), ...fillers(6)],
			[error(targetName, 20, 7), ...fillers(6)]
		);
		const signals = errorSignals(await detectSignals(params, query, today));
		if (sessions === 9) {
			expect(signals).toEqual([]);
		} else {
			expect(signals).toMatchObject([
				{ entityId: targetName, baseline: 20, current: 100, deltaPercent: 400 },
			]);
		}
	});

	it.each([
		"new",
		"disappeared",
	] as const)("preserves a truly %s fingerprint after an exhaustive filtered read", async (state) => {
		const present = [error(targetName), ...fillers(19)];
		const absent = fillers(21);
		const { query } = queryErrors(
			state === "new" ? present : absent,
			state === "new" ? absent : present
		);
		const signals = await detectSignals(params, query, today);
		expect(errorSignals(signals)).toMatchObject([
			{
				entityId: targetName,
				baseline: state === "new" ? 0 : 100,
				current: state === "new" ? 100 : 0,
				direction: state === "new" ? "up" : "down",
			},
		]);
	});

	it("keeps an incomplete filtered read unknown and records the error-family failure", async () => {
		const { query } = queryErrors(
			[error(targetName), ...fillers(19)],
			[error(targetName), ...fillers(21)],
			true
		);
		const diagnostics: DetectionDiagnostics = { failedFamilies: 0 };
		const signals = await detectSignals(
			params,
			query,
			today,
			undefined,
			diagnostics
		);
		expect(errorSignals(signals)).toEqual([]);
		expect(diagnostics.failedFamilies).toBe(1);
	});

	it("keeps disjoint discovery tables within two exhaustive 50-name reads", async () => {
		const current = Array.from({ length: 50 }, (_, index) =>
			error(`Synthetic current ${index}`)
		);
		const previous = Array.from({ length: 50 }, (_, index) =>
			error(`Synthetic previous ${index}`)
		);
		const { query, requests } = queryErrors(current, previous);
		const signals = await detectSignals(params, query, today);
		expect(errorSignals(signals)).toHaveLength(100);
		const exactReads = requests.filter(
			(request) => request.type === "error_fingerprints" && request.filters
		);
		expect(exactReads).toHaveLength(2);
		for (const request of exactReads) {
			expect(request.filters?.[0]?.value).toHaveLength(50);
			expect(request.limit).toBe(50);
		}
	});

	it("does not reread fingerprints when both discovery tables are complete", async () => {
		const { query, requests } = queryErrors(
			[error(targetName, 100)],
			[error(targetName, 20)]
		);
		const signals = await detectSignals(params, query, today);
		expect(errorSignals(signals)).toMatchObject([
			{ baseline: 20, current: 100 },
		]);
		expect(
			requests.filter((request) => request.type === "error_fingerprints")
		).toHaveLength(2);
	});
});
