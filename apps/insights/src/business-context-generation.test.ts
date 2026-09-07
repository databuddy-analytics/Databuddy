import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type {
	BusinessContext,
	BusinessSource,
} from "@databuddy/ai/lib/business-context";
import {
	loadWebsiteBusinessProfile,
	recallWebsiteBusinessContext,
} from "./business-context";
import { prepareCandidateBusinessContexts } from "./generation";
import { prepareInvestigation } from "./investigation";
import { parseFrozenInvestigationPlan } from "./run-candidate-plan";

const input = {
	organizationId: "fixture-org",
	websiteId: "fixture-site",
	domain: "example.com",
	timezone: "UTC",
	asOf: "2026-07-12T00:00:00.000Z",
};
const businessScope = {
	organizationId: input.organizationId,
	websiteId: input.websiteId,
	domain: input.domain,
	startedAt: "2026-07-01T00:00:00.000Z",
};
const candidates = [
	"report_prepared",
	"workspace_created",
	"checkout_opened",
].map((event) =>
	prepareInvestigation(
		{
			baseline: 100,
			current: 20,
			deltaPercent: -80,
			detectedAt: "2026-07-11",
			direction: "down",
			label: event,
			method: "wow",
			metric: "custom_event_reach",
			severity: "warning",
			subjectKey: `custom_event_reach:${event}`,
			entityId: event,
			entityLabel: event,
		},
		7
	)
);
const profile: BusinessContext = {
	capturedAt: input.asOf,
	status: "ready",
	issues: [],
	sources: [
		{
			id: "site-description",
			kind: "website",
			content: "Example report service.",
			url: "https://example.com/",
			observedAt: "2026-07-11T00:00:00Z",
		},
	],
};

describe("freezing investigation business context", () => {
	it("loads shared context once and recalls each exact subject before freezing", async () => {
		let profileReads = 0;
		const recalled: string[] = [];
		const prepared = await prepareCandidateBusinessContexts(
			input,
			candidates,
			{
				loadBusinessProfile: async (params) => {
					profileReads += 1;
					expect(params.scope).toEqual({
						organizationId: input.organizationId,
						websiteId: input.websiteId,
						domain: input.domain,
					});
					expect(params.asOf.toISOString()).toBe(input.asOf);
					expect(params.allowRefresh).toBe(false);
					return profile;
				},
				recallBusinessContext: async (params) => {
					expect(profileReads).toBe(1);
					expect(params.allowWrite).toBe(false);
					expect(params.asOf.toISOString()).toBe(input.asOf);
					expect(params.query).toContain(params.subjectKey);
					recalled.push(params.subjectKey);
					return {
						capturedAt: input.asOf,
						status: "ready",
						issues: [],
						sources: [
							{
								id: params.subjectKey,
								kind: "team_reply",
								content: `Purpose for ${params.subjectKey}`,
								subjectKey: params.subjectKey,
								observedAt: "2026-07-11T12:00:00Z",
							},
						],
					};
				},
			},
			false
		);
		expect(profileReads).toBe(1);
		expect(recalled).toEqual(
			candidates.map((candidate) => candidate.signal.signalKey)
		);
		for (const candidate of prepared) {
			expect(
				candidate.businessContext?.sources.map((source) => source.id)
			).toEqual(["site-description", candidate.signal.signalKey]);
		}
		const frozen = parseFrozenInvestigationPlan(
			JSON.parse(
				JSON.stringify({
					asOf: input.asOf,
					reason: "manual",
					businessScope,
					candidates: prepared,
				})
			)
		);
		expect(
			frozen.candidates.map((candidate) => candidate.businessContext)
		).toEqual(prepared.map((candidate) => candidate.businessContext));
		expect(profileReads).toBe(1);
	});

	it("keeps fresh production context time separate from the frozen measurement time", async () => {
		let capturedAt = "";
		const before = Date.now();
		const prepared = await prepareCandidateBusinessContexts(
			input,
			candidates.slice(0, 1),
			{
				loadBusinessProfile: async (params) => {
					expect(params.allowRefresh).toBe(true);
					expect(params.asOf.getTime()).toBeGreaterThanOrEqual(before);
					capturedAt = new Date().toISOString();
					return { ...profile, capturedAt };
				},
				recallBusinessContext: async (params) => {
					expect(params.allowWrite).toBe(true);
					expect(params.asOf.getTime()).toBeGreaterThanOrEqual(
						Date.parse(capturedAt)
					);
					return { ...profile, capturedAt: params.asOf.toISOString() };
				},
			},
			true
		);
		const frozen = parseFrozenInvestigationPlan({
			asOf: input.asOf,
			reason: "manual",
			businessScope,
			candidates: prepared,
		});
		expect(frozen.asOf).toBe(input.asOf);
		expect(
			Date.parse(frozen.candidates[0]?.businessContext?.capturedAt ?? "")
		).toBeGreaterThanOrEqual(before);
	});

	it("does no context work for an empty scan and no live fallback for uninjected shadow context", async () => {
		let reads = 0;
		expect(
			await prepareCandidateBusinessContexts(
				input,
				[],
				{
					loadBusinessProfile: async () => {
						reads += 1;
						return profile;
					},
					recallBusinessContext: async () => {
						reads += 1;
						return profile;
					},
				},
				false
			)
		).toEqual([]);
		expect(reads).toBe(0);
		const prepared = await prepareCandidateBusinessContexts(
			input,
			candidates,
			{},
			false
		);
		expect(
			prepared.every(
				(candidate) => candidate.businessContext?.status === "disabled"
			)
		).toBe(true);
		expect(
			prepared.every(
				(candidate) => candidate.businessContext?.sources.length === 0
			)
		).toBe(true);
	});

	it("retains shared context and sibling results when optional subject recall fails", async () => {
		const prepared = await prepareCandidateBusinessContexts(
			input,
			candidates,
			{
				loadBusinessProfile: async () => profile,
				recallBusinessContext: async (params) => {
					if (params.subjectKey === candidates[0]?.signal.signalKey) {
						throw new Error("Optional index unavailable");
					}
					return profile;
				},
			},
			false
		);
		expect(prepared).toHaveLength(3);
		expect(prepared[0]?.businessContext?.status).toBe("partial");
		expect(prepared[0]?.businessContext?.sources).toEqual(profile.sources);
		expect(prepared[1]?.businessContext?.status).toBe("ready");
	});

	it("rejects a frozen run after a domain, website, organization or epoch change", () => {
		const persisted = {
			asOf: input.asOf,
			reason: "manual",
			businessScope,
			candidates: [{ ...candidates[0], businessContext: profile }],
		};
		for (const changed of [
			{ ...businessScope, domain: "other.example.com" },
			{ ...businessScope, websiteId: "other-site" },
			{ ...businessScope, organizationId: "other-org" },
			{ ...businessScope, startedAt: "2026-07-10T00:00:00.000Z" },
			{ ...businessScope, startedAt: undefined },
		]) {
			expect(() =>
				parseFrozenInvestigationPlan(persisted, "manual", changed)
			).toThrow("start a new run");
		}
		expect(
			parseFrozenInvestigationPlan(persisted, "manual", businessScope)
				.candidates[0]?.businessContext
		).toEqual(profile);
		expect(persisted.candidates[0]?.businessContext).toEqual(profile);
		expect(() =>
			parseFrozenInvestigationPlan({ ...persisted, businessScope: undefined })
		).toThrow("website scope");
	});

	it("keeps exact PG correction and homepage through real reconciliation under a reply flood", async () => {
		const exact: BusinessSource = {
			id: "older-exact-correction",
			kind: "team_reply",
			content: "Report preparation does not mean the report was downloaded.",
			observedAt: "2026-07-05T00:00:00.000Z",
			subjectKey: candidates[0]!.signal.signalKey,
		};
		const recent: BusinessSource[] = Array.from({ length: 8 }, (_, index) => ({
			id: `newer-unrelated-${index}`,
			kind: "team_reply",
			content: "x".repeat(2000),
			observedAt: "2026-07-11T00:00:00.000Z",
			subjectKey: "goal:unrelated",
		}));
		let lists = 0;
		let searches = 0;
		let batches = 0;
		const deps: NonNullable<Parameters<typeof loadWebsiteBusinessProfile>[1]> =
			{
				currentScope: async () => businessScope,
				loadProfile: async () => {
					lists += 1;
					return profile;
				},
				recall: async () => {
					searches += 1;
					return { ...profile, sources: [] };
				},
				readReplies: async (params) => (params.subjectKey ? [exact] : recent),
				record: async () => {
					batches += 1;
					return { status: "saved", ids: [exact.id] };
				},
			};
		const prepared = await prepareCandidateBusinessContexts(
			input,
			candidates.slice(0, 1),
			{
				loadBusinessProfile: (params) =>
					loadWebsiteBusinessProfile(params, deps),
				recallBusinessContext: (params) =>
					recallWebsiteBusinessContext(params, deps),
			},
			false,
			businessScope
		);
		const records = prepared[0]!.businessContext!.sources;
		expect(records).toContainEqual(exact);
		expect(records).toContainEqual(profile.sources[0]!);
		expect(
			records.filter((source) => source.subjectKey === "goal:unrelated")
		).toHaveLength(7);
		expect(
			records.reduce((length, source) => length + source.content.length, 0)
		).toBeLessThanOrEqual(16_000);
		expect({ lists, searches, batches }).toEqual({
			lists: 1,
			searches: 1,
			batches: 0,
		});
		// A current production pass repairs only the missing exact statement,
		// not the eight recent shared replies whose IDs came from PostgreSQL.
		await prepareCandidateBusinessContexts(
			input,
			candidates.slice(0, 1),
			{
				loadBusinessProfile: (params) =>
					loadWebsiteBusinessProfile(params, deps),
				recallBusinessContext: (params) =>
					recallWebsiteBusinessContext(params, deps),
			},
			true,
			businessScope
		);
		expect({ lists, searches, batches }).toEqual({
			lists: 2,
			searches: 2,
			batches: 1,
		});
	});

	it("does no provider work when production scope resolution fails", async () => {
		let reads = 0;
		const prepared = await prepareCandidateBusinessContexts(
			input,
			candidates,
			{
				loadBusinessProfile: async () => {
					reads += 1;
					return profile;
				},
				recallBusinessContext: async () => {
					reads += 1;
					return profile;
				},
			},
			true,
			null
		);
		expect(reads).toBe(0);
		expect(
			prepared.every(
				(candidate) => candidate.businessContext?.status === "unavailable"
			)
		).toBe(true);
	});

	it("accepts legacy plans without context but rejects invalid persisted source records", () => {
		const original = { asOf: input.asOf, reason: "manual", candidates };
		expect(
			parseFrozenInvestigationPlan(original).candidates[0]?.businessContext
		).toBeUndefined();
		expect(() =>
			parseFrozenInvestigationPlan({
				...original,
				candidates: [
					{
						...candidates[0],
						businessContext: {
							...profile,
							sources: [{ ...profile.sources[0], content: "x".repeat(4001) }],
						},
					},
				],
			})
		).toThrow();
	});
});
