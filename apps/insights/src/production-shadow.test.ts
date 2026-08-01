import { describe, expect, it } from "bun:test";
import type { WebsiteInvestigationArtifact } from "./generation";
import { runDistinctSignalBatch } from "./batch-shadow";
import { metricFamily, resolveShadowAsOf } from "./production-shadow";
import {
	runBoundedWorkerFanout,
	selectDistinctWorkerCandidates,
} from "./worker-fanout-shadow";

function artifact(signalKey: string | null): WebsiteInvestigationArtifact {
	return {
		asOf: "2026-07-31T00:00:00.000Z",
		evidence: [],
		outcome: null,
		signal: signalKey
			? {
				changePercent: 20,
				entity: { id: signalKey, label: signalKey, type: "error" },
				metric: { current: 12, format: "number", label: signalKey, previous: 10 },
				period: {
					current: { from: "2026-07-24", to: "2026-07-30" },
					previous: { from: "2026-07-17", to: "2026-07-23" },
				},
				severity: "warning",
				sentiment: "negative",
				signalKey,
			}
			: null,
		status: signalKey ? "completed" : "no_signals",
	};
}

describe("runDistinctSignalBatch", () => {
	it("passes selected signals to each later candidate and stops at no signal", async () => {
		const candidates = [artifact("first"), artifact("second"), artifact(null)];
		const exclusions: string[][] = [];
		const selected: string[] = [];

		const results = await runDistinctSignalBatch(
			3,
			(excludedSignalKeys) => {
				exclusions.push([...excludedSignalKeys]);
				return Promise.resolve(candidates[exclusions.length - 1]!);
			},
			(item) => {
				if (item.signal) {
					selected.push(item.signal.signalKey);
				}
			}
		);

		expect(exclusions).toEqual([[], ["first"], ["first", "second"]]);
		expect(selected).toEqual(["first", "second"]);
		expect(results.map((item) => item.signal?.signalKey ?? null)).toEqual([
			"first",
			"second",
			null,
		]);
	});

	it("does not continue after a repeated signal", async () => {
		const candidates = [artifact("first"), artifact("first"), artifact("second")];
		let calls = 0;

		const results = await runDistinctSignalBatch(3, () => {
			const result = candidates[calls]!;
			calls += 1;
			return Promise.resolve(result);
		});

		expect(calls).toBe(2);
		expect(results.map((item) => item.signal?.signalKey)).toEqual([
			"first",
			"first",
		]);
	});
});

describe("resolveShadowAsOf", () => {
	it("uses the frozen instant when replaying a manual run", () => {
		const referenceTime = new Date("2026-07-31T13:42:00.000Z");

		expect(
			resolveShadowAsOf(referenceTime, 0, "UTC", "instant").toISOString()
		).toBe("2026-07-31T13:42:00.000Z");
	});

	it("preserves the existing calendar-day replay mode", () => {
		const referenceTime = new Date("2026-07-31T13:42:00.000Z");

		expect(
			resolveShadowAsOf(referenceTime, 0, "UTC", "day").toISOString()
		).toBe("2026-07-31T00:00:00.000Z");
	});
});

describe("shadow signal projection", () => {
	it("never exposes a route or error subject in the report metric family", () => {
		expect(metricFamily("route:lcp:/settings/billing")).toBe("route_health");
		expect(
			metricFamily(
				"error:[nuxt] Received malformed app manifest with a customer path"
			)
		).toBe("error");
	});
});

describe("worker fan-out shadow", () => {
	it("plans distinct worker candidates in detector rank order", () => {
		expect(
			selectDistinctWorkerCandidates(
				[
					{ key: "first", rank: 1 },
					{ key: "first", rank: 2 },
					{ key: "second", rank: 3 },
					{ key: "third", rank: 4 },
				],
				3,
				(candidate) => candidate.key
			)
		).toEqual([
			{ key: "first", rank: 1 },
			{ key: "second", rank: 3 },
			{ key: "third", rank: 4 },
		]);
	});

	it("continues independent workers after one fails", async () => {
		const started: number[] = [];
		const results = await runBoundedWorkerFanout(
			[1, 2, 3],
			2,
			async (candidate) => {
				started.push(candidate);
				if (candidate === 1) {
					throw new Error("first worker failed");
				}
				return candidate * 10;
			}
		);

		expect(started.sort()).toEqual([1, 2, 3]);
		expect(results).toEqual([
			{
				candidate: 1,
				reason: expect.any(Error),
				status: "rejected",
			},
			{ candidate: 2, status: "fulfilled", value: 20 },
			{ candidate: 3, status: "fulfilled", value: 30 },
		]);
	});
});
