import { describe, expect, it } from "bun:test";
import {
	bucketCandidates,
	planChainAssignments,
	type ChainCandidate,
} from "./chain-detection";

function candidate(
	overrides: Partial<ChainCandidate> & Pick<ChainCandidate, "id" | "websiteId">
): ChainCandidate {
	return {
		type: "traffic_drop",
		sentiment: "negative",
		chainId: null,
		createdAt: new Date("2026-06-09T12:00:00Z"),
		...overrides,
	};
}

describe("bucketCandidates", () => {
	it("groups by type and sentiment", () => {
		const buckets = bucketCandidates([
			candidate({ id: "i1", websiteId: "w1", type: "traffic_drop" }),
			candidate({ id: "i2", websiteId: "w2", type: "traffic_drop" }),
			candidate({
				id: "i3",
				websiteId: "w1",
				type: "errors_spike",
				sentiment: "negative",
			}),
		]);
		expect(buckets).toHaveLength(2);
	});

	it("splits same type with different sentiment", () => {
		const buckets = bucketCandidates([
			candidate({
				id: "i1",
				websiteId: "w1",
				type: "traffic_change",
				sentiment: "negative",
			}),
			candidate({
				id: "i2",
				websiteId: "w2",
				type: "traffic_change",
				sentiment: "positive",
			}),
		]);
		expect(buckets).toHaveLength(2);
	});

	it("collects all insight ids and unique websites per bucket", () => {
		const [bucket] = bucketCandidates([
			candidate({ id: "i1", websiteId: "w1" }),
			candidate({ id: "i2", websiteId: "w1" }),
			candidate({ id: "i3", websiteId: "w2" }),
		]);
		expect(bucket.insightIds).toEqual(["i1", "i2", "i3"]);
		expect(bucket.websiteIds.size).toBe(2);
	});

	it("tracks existing chain ids", () => {
		const [bucket] = bucketCandidates([
			candidate({ id: "i1", websiteId: "w1", chainId: "chn_existing" }),
			candidate({ id: "i2", websiteId: "w2", chainId: null }),
		]);
		expect(bucket.existingChainIds).toEqual(new Set(["chn_existing"]));
	});
});

describe("planChainAssignments", () => {
	it("skips buckets with only one website", () => {
		const assignments = planChainAssignments([
			candidate({ id: "i1", websiteId: "w1" }),
			candidate({ id: "i2", websiteId: "w1" }),
		]);
		expect(assignments).toEqual([]);
	});

	it("creates a new chain when multiple websites share a bucket", () => {
		const assignments = planChainAssignments([
			candidate({ id: "i1", websiteId: "w1" }),
			candidate({ id: "i2", websiteId: "w2" }),
		]);
		expect(assignments).toHaveLength(1);
		expect(assignments[0].insightIds).toEqual(["i1", "i2"]);
		expect(assignments[0].websiteIds.sort()).toEqual(["w1", "w2"]);
		expect(assignments[0].chainId).toMatch(/^chn_/);
	});

	it("extends an existing chain when one is present in the bucket", () => {
		const assignments = planChainAssignments([
			candidate({ id: "i1", websiteId: "w1", chainId: "chn_prior" }),
			candidate({ id: "i2", websiteId: "w2", chainId: null }),
		]);
		expect(assignments).toHaveLength(1);
		expect(assignments[0].chainId).toBe("chn_prior");
		expect(assignments[0].insightIds).toEqual(["i1", "i2"]);
	});

	it("does not chain a single-website bucket even if it has a prior chain", () => {
		const assignments = planChainAssignments([
			candidate({ id: "i1", websiteId: "w1", chainId: "chn_prior" }),
			candidate({ id: "i2", websiteId: "w1", chainId: null }),
		]);
		expect(assignments).toEqual([]);
	});

	it("produces independent chains per type/sentiment bucket", () => {
		const assignments = planChainAssignments([
			candidate({ id: "i1", websiteId: "w1", type: "traffic_drop" }),
			candidate({ id: "i2", websiteId: "w2", type: "traffic_drop" }),
			candidate({ id: "i3", websiteId: "w1", type: "errors_spike" }),
			candidate({ id: "i4", websiteId: "w2", type: "errors_spike" }),
		]);
		expect(assignments).toHaveLength(2);
		const chainIds = new Set(assignments.map((a) => a.chainId));
		expect(chainIds.size).toBe(2);
	});
});
