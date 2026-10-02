/**
 * Calibration check for the eval-only Jev judge (issue #968, step 1).
 *
 * A small FROZEN set of known-bad outcomes, each paired with its correct
 * version, starting with the transactions-counted-as-revenue example quoted
 * in the issue and in this directory's README: "a brief assigned transaction
 * count 100 to gross revenue 10000; the number-presence guard accepted it
 * because 100 existed elsewhere." If the judge cannot reliably separate a
 * pair's bad outcome from its good one, that pair fails calibration and this
 * script exits nonzero — a cheap negative result, not a false "it works".
 *
 * This script makes live calls to Vercel AI Gateway and requires
 * AI_GATEWAY_API_KEY. It is not part of `bun test` (no CI environment has
 * spending credentials for this), run it by hand:
 *
 *   AI_GATEWAY_API_KEY=... bun apps/insights/src/evals/judge-calibration.ts
 */
import { judgeCase, type ClaimAttributionDimension } from "./judge";

interface CalibrationPair {
	bad: string;
	dimension: ClaimAttributionDimension;
	good: string;
	id: string;
	toolCalls: {
		input: unknown;
		name: string;
		output: unknown;
		toolCallId: string;
	}[];
}

const CALIBRATION_PAIRS: CalibrationPair[] = [
	{
		id: "transactions-as-gross-revenue",
		dimension: "metric",
		// The exact failure quoted in issue #968 and evals/README.md: a
		// transaction count assigned to gross revenue, and accepted because
		// 100 also appears in the corpus.
		bad: "Gross revenue fell to $100 this week, down sharply from $10,000 last week.",
		good: "Gross revenue held near $10,000 this week across 100 transactions, consistent with last week.",
		toolCalls: [
			{
				name: "get_data",
				toolCallId: "call-revenue",
				input: { metric: "revenue_overview" },
				output: {
					results: {
						revenue: {
							from: "2026-08-29",
							to: "2026-09-04",
							timezone: "UTC",
							data: [{ gross_revenue: 10_000, transaction_count: 100 }],
						},
					},
				},
			},
		],
	},
	{
		id: "goal-entrants-as-login-attempts",
		dimension: "population",
		// Mirrors evals/README.md's cohort-review warning: "The 200 entrants
		// are eligible website visitors, not login attempts."
		bad: "200 login attempts reached the workspace goal this week, up from 164 last week.",
		good: "200 website visitors reached the workspace goal this week, up from 164 last week.",
		toolCalls: [
			{
				name: "get_goal_analytics",
				toolCallId: "call-goal",
				input: { goalId: "workspace-goal" },
				output: {
					definition: { type: "PAGE_VIEW", target: "/start" },
					from: "2026-08-29",
					to: "2026-09-04",
					entrants: 200,
					completions: 164,
				},
			},
		],
	},
	{
		id: "swapped-comparison-window",
		dimension: "period",
		bad: "Visitors fell from 420 in Aug 22–28 to 680 in Aug 29–Sep 4.",
		good: "Visitors fell from 680 in Aug 22–28 to 420 in Aug 29–Sep 4.",
		toolCalls: [
			{
				name: "get_data",
				toolCallId: "call-visitors",
				input: { metric: "visitors" },
				output: {
					results: {
						visitors: [
							{ from: "2026-08-22", to: "2026-08-28", visitors: 680 },
							{ from: "2026-08-29", to: "2026-09-04", visitors: 420 },
						],
					},
				},
			},
		],
	},
	{
		id: "flipped-direction",
		dimension: "direction",
		bad: "The error count rose from 12 to 340 this week.",
		good: "The error count fell from 340 to 12 this week.",
		toolCalls: [
			{
				name: "get_data",
				toolCallId: "call-errors",
				input: { metric: "error_count" },
				output: {
					results: {
						errors: [
							{ period: "previous", count: 340 },
							{ period: "current", count: 12 },
						],
					},
				},
			},
		],
	},
];

const SEPARATION_THRESHOLD = 0.3;
const BAD_CEILING = 0.4;
const GOOD_FLOOR = 0.6;

async function judgeClaim(
	claim: string,
	dimension: ClaimAttributionDimension,
	toolCalls: CalibrationPair["toolCalls"]
) {
	const verdict = await judgeCase({
		finalOutcome: {
			title: "Calibration case",
			summary: claim,
			rootCause: null,
			evidence: [claim],
		},
		history: [],
		proposedEvidence: [
			{
				claim,
				sources: toolCalls.map((call) => ({
					source: "tool",
					name: call.name,
					toolCallId: call.toolCallId,
					resultKey: null,
				})),
			},
		],
		reviewRequired: null,
		signal: {},
		suppliedEvidence: [],
		toolCalls,
	});
	return { verdict, probability: verdict.claims[0]?.[dimension]?.probability };
}

async function main() {
	const results: {
		badProbability: number | undefined;
		goodProbability: number | undefined;
		id: string;
		separated: boolean;
		unavailable: boolean;
	}[] = [];
	for (const pair of CALIBRATION_PAIRS) {
		const [bad, good] = await Promise.all([
			judgeClaim(pair.bad, pair.dimension, pair.toolCalls),
			judgeClaim(pair.good, pair.dimension, pair.toolCalls),
		]);
		const unavailable = !(bad.verdict.available && good.verdict.available);
		const separated =
			!unavailable &&
			bad.probability !== undefined &&
			good.probability !== undefined &&
			bad.probability <= BAD_CEILING &&
			good.probability >= GOOD_FLOOR &&
			good.probability - bad.probability >= SEPARATION_THRESHOLD;
		results.push({
			id: pair.id,
			badProbability: bad.probability,
			goodProbability: good.probability,
			separated,
			unavailable,
		});
	}
	for (const result of results) {
		const status = result.unavailable
			? "SKIPPED (judge unavailable)"
			: result.separated
				? "PASS"
				: "FAIL";
		process.stdout.write(
			`${result.id}: ${status} bad=${result.badProbability?.toFixed(2) ?? "n/a"} good=${result.goodProbability?.toFixed(2) ?? "n/a"}\n`
		);
	}
	if (results.some((result) => result.unavailable)) {
		process.stdout.write(
			"\nCalibration did not run: set AI_GATEWAY_API_KEY and rerun.\n"
		);
		process.exit(2);
	}
	const failed = results.filter((result) => !result.separated);
	if (failed.length) {
		process.stdout.write(
			`\nCalibration FAILED for: ${failed.map((result) => result.id).join(", ")}. The judge cannot reliably separate these known-bad outcomes from their correct versions; do not rely on it beyond eval-only, unreviewed output.\n`
		);
		process.exit(1);
	}
	process.stdout.write("\nCalibration passed for every frozen pair.\n");
	process.exit(0);
}

if (import.meta.main) {
	await main();
}
