import { executeQuery } from "@databuddy/ai/query";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import dayjs from "dayjs";
import {
	type DetectedSignal,
	type DetectSignalsParams,
	makeWowSignal,
	numberField,
	stringField,
	wowWindow,
} from "./detection";

const AI_PRODUCTS_LIMIT = 100;
const MIN_REQUESTS = 50;
const MIN_REQUESTS_RISE_PERCENT = 100;
const MIN_VISITORS = 20;
const MIN_CHANGE_PERCENT = 50;

type AiActivityMetric = "requests" | "visitors";

interface AiAgentQueryInput {
	from: string;
	limit: number;
	projectId: string;
	timezone: string;
	to: string;
	type: "ai_products";
}

export interface AiAgentDetectionDeps {
	query?: (
		input: AiAgentQueryInput,
		abortSignal?: AbortSignal
	) => Promise<Record<string, unknown>[]>;
}

const METRIC_LABELS: Record<AiActivityMetric, (product: string) => string> = {
	requests: (product) => `${product} requests to your pages`,
	visitors: (product) => `Visitors sent by ${product}`,
};

function defaultQuery(
	input: AiAgentQueryInput,
	abortSignal?: AbortSignal
): Promise<Record<string, unknown>[]> {
	return executeQuery(input, undefined, input.timezone, abortSignal);
}

async function readActivity(
	params: DetectSignalsParams,
	today: dayjs.Dayjs,
	dependencies: AiAgentDetectionDeps,
	abortSignal?: AbortSignal
) {
	const window = wowWindow(today, params.lookbackDays);
	const query = dependencies.query ?? defaultQuery;
	const read = async (from: string, to: string) => {
		const rows = await query(
			{
				from,
				limit: AI_PRODUCTS_LIMIT,
				projectId: params.websiteId,
				timezone: params.timezone,
				to,
				type: "ai_products",
			},
			abortSignal
		);
		const byProduct = new Map<string, Record<AiActivityMetric, number>>();
		for (const row of rows) {
			const product = stringField(row, "product");
			if (product) {
				byProduct.set(product, {
					requests: numberField(row, "requests"),
					visitors: numberField(row, "visitors"),
				});
			}
		}
		return byProduct;
	};
	const [current, previous] = await Promise.all([
		read(window.currentFrom, window.currentTo),
		read(window.previousFrom, window.previousTo),
	]);
	return { current, detectedAt: window.currentTo, previous };
}

function isNotable(
	metric: AiActivityMetric,
	current: number,
	baseline: number
): boolean {
	const peak = Math.max(current, baseline);
	if (metric === "visitors") {
		return (
			peak >= MIN_VISITORS &&
			(Math.abs(current - baseline) / Math.max(baseline, 1)) * 100 >=
				MIN_CHANGE_PERCENT
		);
	}
	if (peak < MIN_REQUESTS) {
		return false;
	}
	return current >= baseline
		? current >= baseline * (1 + MIN_REQUESTS_RISE_PERCENT / 100)
		: baseline - current >= baseline * (MIN_CHANGE_PERCENT / 100);
}

function aiActivitySignal(
	metric: AiActivityMetric,
	product: string,
	current: number,
	baseline: number,
	detectedAt: string
): DetectedSignal {
	const unit = metric === "requests" ? "requests" : "visitors";
	return {
		...makeWowSignal(
			`ai_${metric}`,
			METRIC_LABELS[metric](product),
			current,
			baseline,
			detectedAt
		),
		definitionEvidence:
			metric === "requests"
				? `${product}'s crawlers and agents made ${current} ${unit} to the site's pages, compared with ${baseline} in the preceding period. Requests are counted from server-side AI agent tracking and AI agents that run JavaScript.`
				: `${product} sent ${current} ${unit} through referrals or its desktop app, compared with ${baseline} in the preceding period.`,
		entityId: product,
		entityLabel: product,
		subjectKey: `ai_agents:${metric}:${product}`,
	};
}

export async function detectAiAgentSignals(
	params: DetectSignalsParams,
	today: dayjs.Dayjs = dayjs(),
	dependencies: AiAgentDetectionDeps = {},
	abortSignal?: AbortSignal
): Promise<DetectedSignal[]> {
	const { current, detectedAt, previous } = await readActivity(
		params,
		today,
		dependencies,
		abortSignal
	);
	const signals: DetectedSignal[] = [];
	for (const product of new Set([...current.keys(), ...previous.keys()])) {
		for (const metric of ["requests", "visitors"] as const) {
			const now = current.get(product)?.[metric] ?? 0;
			const before = previous.get(product)?.[metric] ?? 0;
			if (isNotable(metric, now, before)) {
				signals.push(
					aiActivitySignal(metric, product, now, before, detectedAt)
				);
			}
		}
	}
	return signals.sort(
		(left, right) => Math.abs(right.deltaPercent) - Math.abs(left.deltaPercent)
	);
}

export async function remeasureAiAgentSignal(
	params: DetectSignalsParams,
	prior: InvestigationSignal,
	today: dayjs.Dayjs = dayjs(),
	dependencies: AiAgentDetectionDeps = {},
	abortSignal?: AbortSignal
): Promise<DetectedSignal | null> {
	const [, metric, ...productParts] = prior.signalKey.split(":");
	const product = productParts.join(":");
	if (!((metric === "requests" || metric === "visitors") && product)) {
		return null;
	}
	const { current, detectedAt, previous } = await readActivity(
		params,
		today,
		dependencies,
		abortSignal
	);
	return aiActivitySignal(
		metric,
		product,
		current.get(product)?.[metric] ?? 0,
		previous.get(product)?.[metric] ?? 0,
		detectedAt
	);
}
