import { describe, expect, it } from "bun:test";
import {
	hasTrackedInsightData,
	resolveTrackedInsightData,
} from "./fetch-context";

const empty = { status: "fulfilled", value: [] } as const;

describe("resolveTrackedInsightData", () => {
	it("keeps confirmed data when another probe fails", () => {
		expect(
			resolveTrackedInsightData([
				empty,
				{ status: "rejected", reason: new Error("warehouse timeout") },
				{ status: "fulfilled", value: [{ total_revenue: 42 }] },
			])
		).toBe(true);
	});

	it("returns false only when every probe completed without data", () => {
		expect(
			resolveTrackedInsightData([
				empty,
				{ status: "fulfilled", value: [{ sessions: 0 }] },
			])
		).toBe(false);
	});

	it("retries when empty probes cannot compensate for a failed probe", () => {
		const failure = new Error("event probe timed out");
		expect(() =>
			resolveTrackedInsightData([
				empty,
				{ status: "rejected", reason: failure },
			])
		).toThrow(failure);
	});
});

describe("hasTrackedInsightData", () => {
	it("retries one transient warehouse failure before deciding data is absent", async () => {
		let calls = 0;
		const query = async () => {
			calls += 1;
			if (calls <= 4) {
				throw new Error("socket closed");
			}
			return [{ sessions: 1 }];
		};

		const result = await hasTrackedInsightData(
			"site",
			"example.com",
			"2026-07-01",
			"2026-07-14",
			"UTC",
			undefined,
			query,
			0
		);

		expect(result).toBe(true);
		expect(calls).toBe(8);
	});

	it("surfaces a persistent warehouse failure after one retry", async () => {
		let calls = 0;
		const query = async () => {
			calls += 1;
			throw new Error("warehouse unavailable");
		};

		await expect(
			hasTrackedInsightData(
				"site",
				"example.com",
				"2026-07-01",
				"2026-07-14",
				"UTC",
				undefined,
				query,
				0
			)
		).rejects.toThrow("warehouse unavailable");
		expect(calls).toBe(8);
	});
});
