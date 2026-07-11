import { executeQuery } from "@databuddy/ai/query";
import { and, between, db, eq, isNull } from "@databuddy/db";
import { annotations } from "@databuddy/db/schema";
import dayjs from "dayjs";
import {
	safeDeltaPercent,
	type DetectedSignal,
	type QueryFn,
} from "./detection";

export interface SegmentMover {
	current: number;
	delta: number;
	deltaPercent: number;
	name: string;
	previous: number;
}

export interface SegmentBreakdown {
	dimension: "pages" | "countries" | "browsers" | "referrers";
	topMovers: SegmentMover[];
}

export interface ErrorContext {
	deltaPercent: number;
	topNewErrors: string[];
	topSpikedErrors: string[];
	totalErrorsCurrent: number;
	totalErrorsPrevious: number;
}

export interface AnnotationContext {
	date: string;
	id: string;
	tags: string[];
	title: string;
}

export interface VitalsContext {
	metrics: Array<{
		name: string;
		currentP75: number;
		previousP75: number;
		deltaPercent: number;
	}>;
}

export interface EnrichedSignal extends DetectedSignal {
	annotations: AnnotationContext[];
	errorContext?: ErrorContext;
	segments: SegmentBreakdown[];
	vitalsContext?: VitalsContext;
}

export interface EnrichSignalsParams {
	lookbackDays: number;
	timezone: string;
	websiteId: string;
}

interface DimensionRow {
	name?: unknown;
	visitors?: unknown;
}

interface ErrorSummaryRow {
	totalErrors?: unknown;
}

interface ErrorTypeRow {
	count?: unknown;
	name?: unknown;
}

export interface SignalWindow {
	currentFrom: string;
	currentTo: string;
	previousFrom: string;
	previousTo: string;
}

const DIMENSION_CONFIGS: {
	dimension: SegmentBreakdown["dimension"];
	queryType: string;
}[] = [
	{ dimension: "pages", queryType: "top_pages" },
	{ dimension: "countries", queryType: "country" },
	{ dimension: "browsers", queryType: "browser_name" },
	{ dimension: "referrers", queryType: "top_referrers" },
];

const SEGMENT_MIN_DELTA_PERCENT = 10;
const SEGMENT_TOP_MOVERS = 3;
const SEGMENT_FETCH_LIMIT = 100;
const ERROR_MIN_DELTA_PERCENT = 20;
const ERROR_TOP_LIMIT = 5;

export function signalWindow(
	signal: DetectedSignal,
	lookbackDays: number
): SignalWindow {
	const detectedDay = dayjs(signal.detectedAt);

	if (signal.method === "zscore") {
		const baselineDates = signal.baselineDates ?? [];
		return {
			currentFrom: detectedDay.format("YYYY-MM-DD"),
			currentTo: detectedDay.format("YYYY-MM-DD"),
			previousFrom:
				baselineDates[0] ??
				detectedDay.subtract(lookbackDays - 1, "day").format("YYYY-MM-DD"),
			previousTo:
				baselineDates.at(-1) ??
				detectedDay.subtract(1, "day").format("YYYY-MM-DD"),
		};
	}

	const windowDays = Math.max(3, lookbackDays);
	return {
		currentFrom: detectedDay
			.subtract(windowDays - 1, "day")
			.format("YYYY-MM-DD"),
		currentTo: detectedDay.format("YYYY-MM-DD"),
		previousFrom: detectedDay
			.subtract(windowDays * 2 - 1, "day")
			.format("YYYY-MM-DD"),
		previousTo: detectedDay.subtract(windowDays, "day").format("YYYY-MM-DD"),
	};
}

function queryPeriodPair(
	websiteId: string,
	timezone: string,
	window: SignalWindow,
	queryFn: QueryFn
) {
	return (type: string, limit?: number) => {
		const base = {
			projectId: websiteId,
			type,
			timezone,
			...(limit ? { limit } : {}),
		};
		return Promise.all([
			queryFn(
				{ ...base, from: window.currentFrom, to: window.currentTo },
				undefined,
				timezone
			),
			queryFn(
				{ ...base, from: window.previousFrom, to: window.previousTo },
				undefined,
				timezone
			),
		]);
	};
}

function computeSegmentMovers(
	currentRows: DimensionRow[],
	previousRows: DimensionRow[]
): SegmentMover[] {
	const merged = new Map<
		string,
		{ name: string; current: number; previous: number }
	>();

	for (const r of currentRows) {
		const name = String(r.name ?? "").trim();
		if (!name) {
			continue;
		}
		const value = Number(r.visitors ?? 0);
		merged.set(name, { name, current: value, previous: 0 });
	}

	for (const r of previousRows) {
		const name = String(r.name ?? "").trim();
		if (!name) {
			continue;
		}
		const value = Number(r.visitors ?? 0);
		const existing = merged.get(name);
		if (existing) {
			existing.previous = value;
		} else {
			merged.set(name, { name, current: 0, previous: value });
		}
	}

	return [...merged.values()]
		.filter((m) => m.current !== 0 || m.previous !== 0)
		.map((m) => ({
			name: m.name,
			current: m.current,
			previous: m.previous,
			delta: Number((m.current - m.previous).toFixed(2)),
			deltaPercent: Number(safeDeltaPercent(m.current, m.previous).toFixed(2)),
		}))
		.filter((m) => Math.abs(m.deltaPercent) >= SEGMENT_MIN_DELTA_PERCENT)
		.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
		.slice(0, SEGMENT_TOP_MOVERS);
}

async function enrichSegments(
	websiteId: string,
	timezone: string,
	window: SignalWindow,
	queryFn: QueryFn
): Promise<SegmentBreakdown[]> {
	const query = queryPeriodPair(websiteId, timezone, window, queryFn);
	const results = await Promise.all(
		DIMENSION_CONFIGS.map(async ({ dimension, queryType }) => {
			const [currentRows, previousRows] = await query(
				queryType,
				SEGMENT_FETCH_LIMIT
			);
			const topMovers = computeSegmentMovers(
				currentRows as DimensionRow[],
				previousRows as DimensionRow[]
			);
			return { dimension, topMovers };
		})
	);
	return results.filter((r) => r.topMovers.length > 0);
}

async function enrichErrors(
	websiteId: string,
	timezone: string,
	window: SignalWindow,
	queryFn: QueryFn
): Promise<ErrorContext | undefined> {
	const query = queryPeriodPair(websiteId, timezone, window, queryFn);
	const [[currentSummary, previousSummary], [currentTypes, previousTypes]] =
		await Promise.all([
			query("error_summary"),
			query("error_types", SEGMENT_FETCH_LIMIT),
		]);

	const currentRow = (currentSummary[0] ?? {}) as ErrorSummaryRow;
	const previousRow = (previousSummary[0] ?? {}) as ErrorSummaryRow;
	const totalCurrent = Number(currentRow.totalErrors ?? 0);
	const totalPrevious = Number(previousRow.totalErrors ?? 0);

	const deltaPercent = safeDeltaPercent(totalCurrent, totalPrevious);
	if (Math.abs(deltaPercent) < ERROR_MIN_DELTA_PERCENT) {
		return;
	}

	const previousErrorNames = new Set(
		(previousTypes as ErrorTypeRow[])
			.map((r) => String(r.name ?? "").trim())
			.filter(Boolean)
	);

	const currentTyped = (currentTypes as ErrorTypeRow[]).map((r) => ({
		name: String(r.name ?? "").trim(),
		count: Number(r.count ?? 0),
	}));

	const previousTypedMap = new Map(
		(previousTypes as ErrorTypeRow[]).map((r) => [
			String(r.name ?? "").trim(),
			Number(r.count ?? 0),
		])
	);

	const topNewErrors = currentTyped
		.filter((r) => r.name && !previousErrorNames.has(r.name))
		.sort((a, b) => b.count - a.count)
		.slice(0, ERROR_TOP_LIMIT)
		.map((r) => r.name);

	const topSpikedErrors = currentTyped
		.filter((r) => r.name && previousErrorNames.has(r.name))
		.map((r) => ({
			name: r.name,
			increase: r.count - (previousTypedMap.get(r.name) ?? 0),
		}))
		.filter((r) => r.increase > 0)
		.sort((a, b) => b.increase - a.increase)
		.slice(0, ERROR_TOP_LIMIT)
		.map((r) => r.name);

	return {
		totalErrorsCurrent: totalCurrent,
		totalErrorsPrevious: totalPrevious,
		deltaPercent: Number(deltaPercent.toFixed(2)),
		topNewErrors,
		topSpikedErrors,
	};
}

export type AnnotationQueryFn = (
	websiteId: string,
	from: Date,
	to: Date
) => Promise<AnnotationContext[]>;

async function defaultAnnotationQuery(
	websiteId: string,
	from: Date,
	to: Date
): Promise<AnnotationContext[]> {
	const rows = await db
		.select({
			id: annotations.id,
			title: annotations.text,
			date: annotations.xValue,
			tags: annotations.tags,
		})
		.from(annotations)
		.where(
			and(
				eq(annotations.websiteId, websiteId),
				between(annotations.xValue, from, to),
				isNull(annotations.deletedAt)
			)
		);

	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		date: dayjs(r.date).format("YYYY-MM-DD"),
		tags: r.tags ?? [],
	}));
}

async function enrichAnnotations(
	websiteId: string,
	window: SignalWindow,
	annotationQueryFn: AnnotationQueryFn
): Promise<AnnotationContext[]> {
	const from = dayjs(window.previousFrom).startOf("day").toDate();
	const to = dayjs(window.currentTo).endOf("day").toDate();
	return await annotationQueryFn(websiteId, from, to);
}

async function enrichVitals(
	websiteId: string,
	timezone: string,
	window: SignalWindow,
	queryFn: QueryFn
): Promise<VitalsContext | undefined> {
	const query = queryPeriodPair(websiteId, timezone, window, queryFn);
	const [currentVitals, previousVitals] = await query("vitals_overview");

	interface VitalsRow {
		metric_name?: string;
		p75?: number;
		samples?: number;
	}
	const currentMap = new Map(
		(currentVitals as VitalsRow[]).map((r) => [r.metric_name, r])
	);
	const previousMap = new Map(
		(previousVitals as VitalsRow[]).map((r) => [r.metric_name, r])
	);

	const metrics: VitalsContext["metrics"] = [];
	for (const name of ["LCP", "INP", "CLS", "FCP", "TTFB"]) {
		const cur = currentMap.get(name);
		const prev = previousMap.get(name);
		const curVal = cur?.p75 ?? 0;
		const prevVal = prev?.p75 ?? 0;
		if (
			curVal === 0 ||
			prevVal === 0 ||
			(cur?.samples ?? 0) < 5 ||
			(prev?.samples ?? 0) < 5
		) {
			continue;
		}
		const pct = safeDeltaPercent(curVal, prevVal);
		if (Math.abs(pct) >= 15) {
			metrics.push({
				name,
				currentP75: curVal,
				previousP75: prevVal,
				deltaPercent: Number(pct.toFixed(1)),
			});
		}
	}

	return metrics.length > 0 ? { metrics } : undefined;
}

export function enrichSignals(
	signals: DetectedSignal[],
	params: EnrichSignalsParams,
	queryFn: QueryFn = executeQuery,
	annotationQueryFn: AnnotationQueryFn = defaultAnnotationQuery
): Promise<EnrichedSignal[]> {
	if (signals.length === 0) {
		return Promise.resolve([]);
	}

	const { websiteId, timezone, lookbackDays } = params;
	const queryCache = new Map<string, ReturnType<QueryFn>>();
	const cachedQuery: QueryFn = (
		request,
		domain,
		queryTimezone,
		abortSignal
	) => {
		const key = JSON.stringify([request, domain, queryTimezone]);
		const cached = queryCache.get(key);
		if (cached) {
			return cached;
		}
		const result = queryFn(request, domain, queryTimezone, abortSignal);
		queryCache.set(key, result);
		return result;
	};

	return Promise.all(
		signals.map(async (signal) => {
			const window = signalWindow(signal, lookbackDays);
			const canCompareContinuousPeriods = signal.method !== "zscore";

			const [segments, errorContext, vitalsContext, signalAnnotations] =
				await Promise.all([
					canCompareContinuousPeriods
						? enrichSegments(websiteId, timezone, window, cachedQuery)
						: Promise.resolve([]),
					canCompareContinuousPeriods
						? enrichErrors(websiteId, timezone, window, cachedQuery)
						: Promise.resolve(undefined),
					canCompareContinuousPeriods
						? enrichVitals(websiteId, timezone, window, cachedQuery)
						: Promise.resolve(undefined),
					enrichAnnotations(websiteId, window, annotationQueryFn),
				]);

			return {
				...signal,
				segments,
				errorContext,
				vitalsContext,
				annotations: signalAnnotations,
			};
		})
	);
}
