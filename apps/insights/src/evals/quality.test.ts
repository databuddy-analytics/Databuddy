import "@databuddy/test/env";
import { expect, it } from "bun:test";
import type { InsightDefinitionEditChanges } from "@databuddy/shared/insights";
import { z } from "zod";
import { renderRevenueEvidence, type InsightAgentResult } from "../agent";
import { qualityCases } from "./quality";

it.each([
	{ comparison: "There were 1,200 visits.", retained: false },
	{
		comparison: "New-user visits were unchanged across both weeks.",
		retained: true,
	},
	{
		comparison: "New-user visits remained 1,200 in both windows.",
		retained: true,
	},
	{
		comparison: "New-user visits held at 1,200 in both comparison weeks.",
		retained: true,
	},
	{ comparison: "Visits held at 1,200 this week.", retained: false },
	{ comparison: "Completions fell from 80 to 24.", retained: false },
])("scores the steady-arrival context rather than an exact count: $comparison", ({
	comparison,
	retained,
}) => {
	const fixture = qualityCases.find(
		(entry) => entry.id === "useful-signup-decline"
	);
	if (!fixture) throw new Error("Missing signup evaluation");
	const failures = fixture.check(
		{
			toolCallCount: 0,
			outcome: {
				title: "Completed account creation fell",
				summary: "Completed accounts fell from 80 to 24.",
				impact: comparison,
				rootCause: null,
				evidence: ["The completion emitter was unchanged."],
				findingKind: "product_outcome",
				publish: true,
				publicationBasis: "measured_impact",
				next: {
					type: "resolve",
					reason: "No inspected remedy is established.",
				},
			},
		},
		[]
	);
	expect(failures).toHaveLength(retained ? 0 : 1);
});

it.each([
	{ startDate: "2026-08-22", endDate: "2026-08-28", completed: 100 },
	{ startDate: "2026-08-29", endDate: "2026-09-04", completed: 20 },
	{ startDate: "2026-08-22", endDate: "2026-09-04", completed: 120 },
])("returns actual period aggregates instead of rejecting a pooled source query: $startDate–$endDate", async (window) => {
	const fixture = qualityCases.find(
		(entry) => entry.id === "signup-source-comparison"
	);
	const read = fixture?.tools.get_funnel_analytics_by_referrer;
	if (!read?.execute) throw new Error("Missing source comparison fixture");
	const output = await read.execute(
		{
			funnelId: "signup-journey",
			startDate: window.startDate,
			endDate: window.endDate,
		},
		{ toolCallId: "synthetic-read", messages: [] }
	);
	expect(output).toMatchObject({
		referrer_analytics: [
			{ referrer: "google.com", completed_users: window.completed },
			{ referrer: "direct" },
		],
	});
});

const steps: NonNullable<InsightDefinitionEditChanges["steps"]> = [
	{ name: "Landing", type: "PAGE_VIEW", target: "/start" },
	{
		name: "Account created",
		type: "EVENT",
		target: "account_completed",
		conditions: { plan: "paid" },
	},
];

function check(changes: InsightDefinitionEditChanges) {
	const fixture = qualityCases.find(
		(entry) => entry.id === "funnel-conditions-repair"
	);
	if (!fixture) {
		throw new Error("Missing funnel repair evaluation");
	}
	return fixture.check(
		{
			toolCallCount: 2,
			outcome: {
				title: "Account creation tracks a retired event",
				summary: "The final step uses the old completion event.",
				impact: "Completed journeys cannot be measured.",
				rootCause: "The handler emits a replacement completion event.",
				evidence: ["The inspected final step differs from the emitted event."],
				findingKind: "measurement_definition",
				publish: true,
				publicationBasis: "decision_safety",
				next: {
					type: "act",
					action: "Update the final event target.",
					target: "Account creation journey",
					verification: "Compare completed journeys with the emitted event.",
					execution: { operation: "edit", changes },
				},
			},
		},
		[]
	);
}

it("accepts equivalent omitted and empty step conditions in a valid repair", () => {
	expect(check({ steps })).toEqual([]);
	expect(
		check({
			steps: steps.map((step) => ({
				...step,
				conditions: step.conditions ?? {},
			})),
		})
	).toEqual([]);
});

it.each([
	"first step",
	"extra step",
	"filters",
])("does not score an unrelated %s change as a valid funnel repair", (variant) => {
	const changes: InsightDefinitionEditChanges = { steps };
	if (variant === "first step") {
		changes.steps = steps.map((step, index) =>
			index === 0 ? { ...step, target: "/different" } : step
		);
	}
	if (variant === "extra step") {
		changes.steps = [
			...steps,
			{ name: "Unrelated", target: "other_event", type: "EVENT" },
		];
	}
	if (variant === "filters") {
		changes.filters = [{ field: "country", operator: "equals", value: "US" }];
	}
	expect(check(changes)).toHaveLength(1);
});

it.each([
	{
		id: "available-repository-mechanism",
		name: "github_read_file",
		input: { path: "src/checkout.ts", ref: "abcdef1" },
	},
	{
		id: "reply-failed-recovery",
		name: "get_goal_analytics",
		input: {
			goalId: "workspace-goal",
			startDate: "2026-08-29",
			endDate: "2026-09-04",
		},
	},
	{
		id: "reply-verified-recovery",
		name: "get_goal_analytics",
		input: {
			goalId: "workspace-goal",
			startDate: "2026-08-29",
			endDate: "2026-09-04",
		},
	},
])("requires a successful exact read for $id", async (sample) => {
	const fixture = qualityCases.find((entry) => entry.id === sample.id);
	const read = fixture?.tools[sample.name];
	if (!(fixture && read?.execute)) throw new Error("Missing context fixture");
	const result = {
		toolCallCount: 1,
		outcome: {
			title: "Reviewed finding",
			summary: "A verified result.",
			impact: null,
			rootCause: "Inspected null access.",
			evidence: ["Measured result."],
			next:
				sample.name === "github_read_file"
					? {
							type: "act" as const,
							action: "Guard null access.",
							target: "Checkout",
							verification: "The path succeeds.",
						}
					: { type: "resolve" as const, reason: "Verification checked." },
		},
	};
	const output = await read.execute(sample.input, {
		toolCallId: "read",
		messages: [],
	});
	const call = { name: sample.name, input: sample.input, output };
	expect(fixture.check(result, [call])).toEqual([]);
	expect(
		fixture.check(result, [{ ...call, output: { error: "Unavailable" } }])
	).toHaveLength(1);
	expect(fixture.check(result, [{ ...call, output: undefined }])).toHaveLength(
		1
	);
	expect(fixture.check(result, [{ ...call, input: {} }])).toHaveLength(1);
});

it.each([
	{
		id: "revenue-currency-refunds",
		gross: 6000,
		attributed: 6000,
		attributedTransactions: 60,
	},
	{
		id: "revenue-attribution-shift",
		gross: 10000,
		attributed: 4000,
		attributedTransactions: 40,
	},
])("keeps revenue currencies, gross totals, attribution and refunds separate: $id", async ({
	id,
	gross,
	attributed,
	attributedTransactions,
}) => {
	const read = qualityCases.find((entry) => entry.id === id)?.tools.get_data;
	if (!read?.execute) throw new Error("Missing revenue fixture");
	const query = {
		type: "revenue_overview",
		websiteId: "synthetic-site",
		from: "2026-08-29",
		to: "2026-09-04",
	};
	const output = await read.execute(
		{ queries: [query, { ...query, from: "2026-08-22", to: "2026-08-28" }] },
		{ toolCallId: "revenue", messages: [] }
	);
	expect(output).toMatchObject({
		results: {
			"revenue_overview@synthetic-site#1": {
				from: query.from,
				to: query.to,
				data: [
					{
						currency: "USD",
						total_revenue: gross,
						refund_amount: 1200,
						attributed_revenue: attributed,
						attributed_transactions: attributedTransactions,
					},
					{ currency: "EUR", total_revenue: 5000, refund_amount: 0 },
				],
			},
			"revenue_overview@synthetic-site#2": {
				from: "2026-08-22",
				to: "2026-08-28",
				data: [
					{ currency: "USD", total_revenue: 10000, refund_amount: 200 },
					{ currency: "EUR", total_revenue: 5000, refund_amount: 0 },
				],
			},
		},
	});
	expect(() =>
		read.execute?.(
			{ queries: [{ ...query, websiteId: "another-site" }] },
			{ toolCallId: "wrong-site", messages: [] }
		)
	).toThrow();
});

it("rejects an activation definition lookup for another website", () => {
	const read = qualityCases.find(
		(entry) => entry.id === "activation-source-comparison"
	)?.tools.list_funnels;
	if (!read?.execute) throw new Error("Missing activation fixture");
	expect(() =>
		read.execute?.(
			{ websiteId: "another-site" },
			{ toolCallId: "wrong-site", messages: [] }
		)
	).toThrow();
});

const holdoutOutcome: InsightAgentResult = {
	toolCallCount: 1,
	outcome: {
		title: "Receipt attribution fell and refunds increased",
		summary:
			"Acquisition reporting covers less revenue while gross settlements stay steady.",
		impact: null,
		rootCause: null,
		evidence: ["Synthetic comparison"],
		publish: true,
		findingKind: "measurement_coverage",
		publicationBasis: "decision_safety",
		next: { type: "resolve", reason: "No cause is established." },
	},
};

it("does not excuse a new repair when a saved verification has population drift", () => {
 const fixture = qualityCases.find((entry) => entry.id === "check-population-drift");
 const previous = fixture?.input.history.find((entry) => entry.kind === "investigation");
 if (!fixture || previous?.kind !== "investigation") throw new Error("Missing population drift evaluation");
 expect(fixture.check({...holdoutOutcome, outcome: previous.outcome}, [])).toContain("Repeated the already-applied definition repair");
});

it.each([undefined, null])(
	"accepts an unscoped native goal read with cohort %s while rejecting scope drift",
	async (cohort) => {
		const fixture = qualityCases.find(
			(entry) => entry.id === "current-goal-unchanged"
		);
		const read = fixture?.tools.get_goal_analytics;
		if (!(fixture && read?.execute && read.inputSchema instanceof z.ZodType))
			throw new Error("Missing native goal evaluation");
		const query = read.inputSchema.parse({
			goalId: fixture.input.signal.entity.id,
			startDate: fixture.input.signal.period.current.from,
			endDate: fixture.input.signal.period.current.to,
			...(cohort === null ? { cohort } : {}),
		});
		const call = {
			name: "get_goal_analytics",
			input: query,
			output: await read.execute(query, { toolCallId: "goal", messages: [] }),
		};
		const result = {
			...holdoutOutcome,
			outcome: {
				...holdoutOutcome.outcome,
				publish: false,
				publicationBasis: null,
			},
		};
		expect(fixture.check(result, [call])).toEqual([]);
		for (const change of [
			{ goalId: "other-goal" },
			{ websiteId: "other-site" },
			{ startDate: "2026-09-01" },
			{ cohort: { country: "US" } },
		]) {
			expect(
				fixture.check(result, [{ ...call, input: { ...query, ...change } }])
			).toEqual([
				`Did not remeasure the exact goal for ${fixture.input.signal.period.current.from}–${fixture.input.signal.period.current.to}`,
			]);
		}
	}
);

it.each([
	false,
	true,
])("scores accepted revenue fields and their rendered metric/value pairs (reordered: %s)", async (reordered) => {
	const fixture = qualityCases.find(
		(entry) =>
			entry.id ===
			(reordered
				? "holdout-revenue-competing-reordered"
				: "holdout-revenue-competing")
	);
	const read = fixture?.tools.get_data;
	if (!(fixture && read?.execute && read.inputSchema instanceof z.ZodType))
		throw new Error("Missing revenue holdout");
	const query = {
		queries: Object.values(fixture.input.signal.period).map((window) => ({
			...window,
			type: "revenue_overview",
			groupBy: ["currency"],
			filters: [{ field: "currency", op: "eq", value: "USD" }],
		})),
	};
	expect(read.inputSchema.safeParse(query).success).toBe(true);
	const output = z
		.object({
			results: z.record(
				z.string(),
				z
					.object({ data: z.array(z.record(z.string(), z.unknown())) })
					.passthrough()
			),
		})
		.parse(await read.execute(query, { toolCallId: "holdout", messages: [] }));
	const readings = Object.values(output.results);
	const sources = Object.keys(output.results).map((resultKey) => ({
		source: "tool",
		name: "get_data",
		toolCallId: "holdout",
		resultKey,
	}));
	expect(Object.keys(readings[0].data[0])[0]).toBe(
		reordered ? "attributed_revenue" : "currency"
	);
	const required = ["total_revenue", "attributed_revenue", "refund_amount"];
	for (const omitted of [null, ...required]) {
		const selection = {
			currency: "USD",
			fields: required.filter((field) => field !== omitted),
		};
		const evidence = [
			renderRevenueEvidence(selection, readings, fixture.input).text,
		];
		const failures = fixture.check(
			{ ...holdoutOutcome, outcome: { ...holdoutOutcome.outcome, evidence } },
			[],
			{ evidence: [{ claim: selection, sources }] }
		);
		expect(failures).toHaveLength(omitted ? 2 : 0);
		if (omitted)
			expect(failures[0]).toBe(`Accepted finish omitted USD ${omitted}`);
	}
	const selection = { currency: "USD", fields: required };
	const text = renderRevenueEvidence(selection, readings, fixture.input).text;
	const swapped = text.replace(
		"Gross Revenue: 12,000 → 12,000",
		"Gross Revenue: 10,800 → 3,600"
	);
	expect(
		fixture.check(
			{
				...holdoutOutcome,
				outcome: { ...holdoutOutcome.outcome, evidence: [swapped] },
			},
			[],
			{ evidence: [{ claim: selection, sources }] }
		)
	).toEqual(["Rendered evidence omitted Gross Revenue: 12,000 → 12,000"]);
});

it.each([
	true,
	false,
])("requires a relevant widened capability search (available: %s)", async (available) => {
	const fixture = qualityCases.find(
		(entry) =>
			entry.id ===
			`holdout-discovery-cross-category-${available ? "available" : "unavailable"}`
	);
	const read = fixture?.tools.discover_query_types;
	if (!(fixture && read?.execute && read.inputSchema instanceof z.ZodType))
		throw new Error("Missing discovery holdout");
	const result = {
		...holdoutOutcome,
		outcome: {
			...holdoutOutcome.outcome,
			publish: available,
			publicationBasis: available
				? holdoutOutcome.outcome.publicationBasis
				: null,
		},
	};
	for (const query of [
		{ category: "Audience", search: "revenue" },
		{ category: "Audience", search: "" },
		{ search: "language" },
		{ search: "revenue" },
		{ search: "" },
	]) {
		expect(read.inputSchema.safeParse(query).success).toBe(true);
		const output = await read.execute(query, {
			toolCallId: "catalog",
			messages: [],
		});
		const widened = !query.category && query.search !== "language";
		if (!query.category && !query.search) {
			expect(JSON.stringify(output)).not.toContain('"outputFields"');
		}
		if (available && !query.category && query.search === "revenue") {
			expect(JSON.stringify(output)).toContain('"outputFields"');
		}
		expect(
			fixture.check(result, [
				{ name: "discover_query_types", input: query, output },
			])
		).toHaveLength(widened ? 0 : 1);
		if (query.search === "revenue" && !query.category)
			expect(output).toMatchObject({
				matchCount: available ? 1 : 0,
				types: available
					? [
							expect.objectContaining({
								name: "revenue_overview",
								category: "Profiles",
							}),
						]
					: [],
			});
	}
	const data = fixture.tools.get_data;
	if (!(data.execute && data.inputSchema instanceof z.ZodType))
		throw new Error("Missing native query schema");
	const query = {
		queries: [
			{ type: "revenue_overview", ...fixture.input.signal.period.current },
		],
	};
	expect(data.inputSchema.safeParse(query).success).toBe(true);
	expect(
		data.inputSchema.safeParse({ queries: [{ type: "fictional_retention" }] })
			.success
	).toBe(false);
	const output = z
		.object({ results: z.record(z.string(), z.unknown()) })
		.parse(
			await data.execute(query, { toolCallId: "measurement", messages: [] })
		);
	expect(
		z
			.object({ data: z.array(z.unknown()) })
			.safeParse(Object.values(output.results)[0]).success
	).toBe(available);
});

it.each([
	{ offset: 0, length: 15000, valid: true },
	{ offset: 1, length: 1, valid: false },
	{ offset: 0, length: 1, valid: false },
])("source fixture honors its supported read window: %j", async ({
	offset,
	length,
	valid,
}) => {
	const read = qualityCases.find(
		(entry) => entry.id === "available-repository-mechanism"
	)?.tools.github_read_file;
	if (!read?.execute) throw new Error("Missing repository fixture");
	const output = await read.execute(
		{ path: "src/checkout.ts", ref: "abcdef1", offset, length },
		{ toolCallId: "source-window", messages: [] }
	);
	expect(output).toMatchObject(
		valid ? { content: expect.any(String) } : { error: expect.any(String) }
	);
});
