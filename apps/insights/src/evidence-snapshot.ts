import {
	insightMeasurementSchema,
	investigationEvidenceSnapshotSchema,
	type InvestigationEvidenceSnapshot,
	type InvestigationSignal,
} from "@databuddy/shared/insights";
import { z } from "zod";

const MAX_SNAPSHOT_BYTES = 256_000;
const secretKeys = new Set([
	"authorization",
	"cookie",
	"setcookie",
	"password",
	"secret",
	"token",
	"accesstoken",
	"refreshtoken",
	"apikey",
	"serviceauth",
	"headers",
	"reasoning",
	"reasoningtext",
]);
const credentialPattern =
	/\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|Bearer\s+[A-Za-z0-9._~+/-]{12,})/g;

/** Copy only JSON data; never retain SDK messages, auth contexts or reasoning. */
export function snapshotJson(
	value: unknown
): z.infer<ReturnType<typeof z.json>> {
	return JSON.parse(
		JSON.stringify(value, (key, entry) => {
			if (
				secretKeys.has(
					key.toLowerCase().replaceAll("_", "").replaceAll("-", "")
				)
			) {
				return "[redacted]";
			}
			if (typeof entry === "string") {
				return entry.replace(credentialPattern, "[redacted]");
			}
			if (typeof entry === "bigint") {
				return entry.toString();
			}
			return entry;
		}) ?? "null"
	);
}

// Snapshot retention is a positive allowlist, not a generic raw-data sanitizer.
const scopeText = z
	.string()
	.max(256)
	.regex(/^[\p{L}\p{N}_./(): -]*$/u)
	.refine(
		(value) =>
			value.search(credentialPattern) < 0 && !value.includes("PRIVATE KEY")
	);
const scopeId = z
	.string()
	.min(1)
	.max(200)
	.regex(/^[A-Za-z0-9_.:-]+$/);
const scopeFilter = z.object({
	field: z.enum([
		"event_name",
		"path",
		"referrer",
		"country",
		"city",
		"device_type",
		"browser_name",
		"os_name",
		"language",
		"utm_source",
		"utm_medium",
		"utm_campaign",
		"screen_resolution",
	]),
	operator: z.enum(["equals", "contains", "not_equals", "in", "not_in"]),
	value: z.union([scopeText, z.array(scopeText).max(50)]),
});
const savedCohort = z.object({
	filters: z
		.array(
			scopeFilter.extend({
				field: z.enum([
					"browser_name",
					"device_type",
					"os_name",
					"country",
					"utm_source",
					"utm_medium",
					"utm_campaign",
				]),
				operator: z.enum(["equals", "not_equals", "in", "not_in"]),
			})
		)
		.min(1)
		.max(8),
});
const savedDefinition = z.union([
	z.object({
		type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
		target: scopeText,
		filters: z.array(scopeFilter).max(32),
	}),
	z.object({
		steps: z
			.array(
				z.object({
					name: scopeText,
					type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
					target: scopeText,
				})
			)
			.min(2)
			.max(10),
		filters: z.array(scopeFilter).max(32),
	}),
]);
const savedMeasurement = z.object({
	websiteId: scopeId,
	definitionId: scopeId,
	startDate: z.iso.date(),
	endDate: z.iso.date(),
	definition: savedDefinition,
});
const measurementRequest = z.object({
	websiteId: scopeId.optional(),
	goalId: scopeId.optional(),
	funnelId: scopeId.optional(),
	startDate: z.iso.date().optional(),
	endDate: z.iso.date().optional(),
	cohort: savedCohort.nullish(),
	limit: z.number().int().nonnegative().optional(),
});
const count = z.number().int().nonnegative().safe();
const rate = z.number().finite();
const measurementCounts = z.object({
	total_users_entered: count,
	total_users_completed: count,
	overall_conversion_rate: rate.optional(),
	avg_completion_time: rate.optional(),
	biggest_dropoff_step: count.optional(),
	biggest_dropoff_rate: rate.optional(),
	duration_available: z.boolean().optional(),
	measurement: savedMeasurement.optional(),
	savedDefinition: savedDefinition.optional(),
	steps_analytics: z
		.array(
			z.object({
				step_number: count,
				users: count,
				total_users: count,
				conversion_rate: rate,
				dropoffs: count,
				dropoff_rate: rate,
				avg_time_to_complete: rate.optional(),
				error_count: count.optional(),
				error_rate: rate.optional(),
				error_context_available: z.boolean().optional(),
			})
		)
		.max(10)
		.optional(),
});
const referrerCounts = z.object({
	referrer_analytics: z
		.array(
			z.object({
				// Keep a source/hostname, never a referrer URL path or search/query string.
				referrer: z
					.string()
					.max(253)
					.regex(
						/^(?:|\(direct\)|(?:https?:\/\/)?[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\/?)$/
					),
				total_users: count,
				completed_users: count,
				conversion_rate: rate.optional(),
			})
		)
		.max(1000),
	measurement: savedMeasurement.optional(),
	savedDefinition: savedDefinition.optional(),
});
const retainedDescriptions = {
	get_goal_analytics:
		"Native goal analytics. total_users_entered counts website page-view visitors matching evaluated filters except event_name; total_users_completed counts visitors matching the goal. These are visitors, not attempts. measurement contains actual dates and evaluated definition; savedDefinition is the saved configuration before read-time cohort filters.",
	get_funnel_analytics:
		"Native funnel analytics. Entrants are distinct visitors matching the first step; completions reach every ordered step. These are visitors, not projects or attempts. measurement contains actual dates and evaluated selectors; savedDefinition precedes read-time cohort filters. Stored step conditions are not evaluated and are not retained here.",
	get_funnel_analytics_by_referrer:
		"Native funnel visitors grouped by referrer/source. Entrants match the first step and completions reach the ordered steps. These are visitors, not attempts. Each read has one date range; rows may be ranked or limited. Stored step conditions are not evaluated and are not retained here.",
};

function projectMeasurementRead(read: {
	toolName: string;
	input: unknown;
	output: unknown;
}) {
	if (
		!(
			read.toolName === "get_goal_analytics" ||
			read.toolName === "get_funnel_analytics" ||
			read.toolName === "get_funnel_analytics_by_referrer"
		)
	) {
		return null;
	}
	const request = measurementRequest.safeParse(read.input);
	const output = (
		read.toolName === "get_funnel_analytics_by_referrer"
			? referrerCounts
			: measurementCounts
	).safeParse(read.output);
	if (!(request.success && output.success)) {
		return null;
	}
	return {
		input: request.data,
		output: output.data,
		description: retainedDescriptions[read.toolName],
	};
}

export function createEvidenceSnapshot(input: {
	organizationId: string;
	websiteId: string;
	capturedAt: string;
	signal: InvestigationSignal;
	evidence: string[];
	reads: {
		toolName: string;
		toolCallId: string;
		input: unknown;
		output: unknown;
	}[];
	descriptions: Record<string, string | undefined>;
}): InvestigationEvidenceSnapshot {
	const snapshot: InvestigationEvidenceSnapshot = {
		version: 1,
		completion: "incomplete",
		organizationId: input.organizationId,
		websiteId: input.websiteId,
		signalKey: input.signal.signalKey,
		capturedAt: input.capturedAt,
		signal: investigationEvidenceSnapshotSchema.shape.signal.parse(
			snapshotJson(input.signal)
		),
		providedEvidence: [],
		reads: [],
		limitations: [],
	};
	// Reserve room for bounded omission notices. Each entry is serialized once.
	const dataBudget = MAX_SNAPSHOT_BYTES - 16_384;
	let usedBytes = Buffer.byteLength(JSON.stringify(snapshot));
	if (usedBytes > dataBudget) {
		throw new Error("The native signal exceeds the saved-evidence size limit");
	}
	const limitation = (message: string) => {
		if (
			snapshot.limitations.length < 16 &&
			!snapshot.limitations.includes(message)
		) {
			snapshot.limitations.push(message.slice(0, 256));
		}
	};
	if (input.evidence.length) {
		limitation(
			"Free-form supplied context was not retained; use the validated outcome for its attributed interpretation, not as raw measurement evidence."
		);
	}
	for (const read of input.reads) {
		if (read.toolName === "finish_investigation") {
			continue;
		}
		if (
			read.output == null ||
			(typeof read.output === "object" &&
				(("error" in read.output && read.output.error != null) ||
					("success" in read.output && read.output.success === false)))
		) {
			limitation(
				"An unsuccessful read was not retained; unavailable is not zero."
			);
			continue;
		}
		const projection = projectMeasurementRead(read);
		const callId = scopeId.safeParse(read.toolCallId);
		if (!(projection && callId.success)) {
			limitation(
				"A raw or unsupported read, or a read with unsafe/unsupported scope, was omitted. Its absence cannot establish a fact or a complete population."
			);
			continue;
		}
		const record = {
			name: read.toolName,
			toolCallId: callId.data,
			resultKey: null,
			...projection,
		};
		const bytes = Buffer.byteLength(JSON.stringify(record)) + 1;
		if (usedBytes + bytes > dataBudget) {
			limitation(
				"A measurement projection was omitted due to the saved-evidence size limit; no complete population claim is supported by that omission."
			);
		} else {
			snapshot.reads.push(record);
			usedBytes += bytes;
			limitation(
				"Retained reads contain only allowlisted measurement fields. Raw rows, event properties, source content, free text, stored step conditions and other metadata were not saved."
			);
		}
	}
	return investigationEvidenceSnapshotSchema.parse(snapshot);
}

const countsSchema = z.object({
	total_users_entered: z.number().int().nonnegative(),
	total_users_completed: z.number().int().nonnegative(),
});
const referrerSchema = z.object({
	referrer: z.string(),
	total_users: z.number().int().nonnegative(),
	completed_users: z.number().int().nonnegative(),
});
const referrerScopeSchema = z.object({
	websiteId: z.string(),
	funnelId: z.string(),
	startDate: z.string(),
	endDate: z.string(),
	cohort: savedCohort.nullish(),
});

function previousReferrerRates(snapshot: InvestigationEvidenceSnapshot) {
	const rates = new Map<string, { source: string; percent: number } | null>();
	for (const read of snapshot.reads) {
		if (read.name !== "get_funnel_analytics_by_referrer") {
			continue;
		}
		const scope = referrerScopeSchema.safeParse(read.input);
		const rows = z
			.object({ referrer_analytics: z.array(referrerSchema) })
			.safeParse(read.output);
		if (
			!(scope.success && rows.success) ||
			scope.data.websiteId !== snapshot.websiteId ||
			scope.data.funnelId !== snapshot.signal.entity.id ||
			scope.data.startDate !== snapshot.signal.period.previous.from ||
			scope.data.endDate !== snapshot.signal.period.previous.to
		) {
			continue;
		}
		for (const row of rows.data.referrer_analytics) {
			if (!row.total_users || row.completed_users > row.total_users) {
				continue;
			}
			const key = JSON.stringify([
				scope.data.websiteId,
				scope.data.funnelId,
				scope.data.cohort ?? null,
				row.referrer,
			]);
			// Repeated/conflicting sources are left to explicit evidence review.
			rates.set(
				key,
				rates.has(key)
					? null
					: {
							source: read.toolCallId,
							percent: (100 * row.completed_users) / row.total_users,
						}
			);
		}
	}
	return rates;
}

/** Only native count contracts define arithmetic; arbitrary numeric text never does. */
export function clarificationMetrics(snapshot: InvestigationEvidenceSnapshot) {
	const previousRates = previousReferrerRates(snapshot);
	return snapshot.reads.flatMap<z.infer<ReturnType<typeof z.json>>>((read) => {
		if (
			read.name === "get_funnel_analytics" ||
			read.name === "get_goal_analytics"
		) {
			const parsed = countsSchema.safeParse(read.output);
			if (
				!parsed.success ||
				parsed.data.total_users_completed > parsed.data.total_users_entered
			) {
				return [];
			}
			const {
				total_users_entered: entrants,
				total_users_completed: completed,
			} = parsed.data;
			const measured = z
				.object({ measurement: insightMeasurementSchema })
				.safeParse(read.output);
			return [
				{
					source: { toolCallId: read.toolCallId, resultKey: read.resultKey },
					scope: measured.success
						? snapshotJson(measured.data.measurement)
						: null,
					requestedScope: read.input,
					population:
						read.name === "get_goal_analytics"
							? "eligible website visitors"
							: "funnel entrants",
					entrants,
					completed,
					notCompleted: entrants - completed,
					conversionPercent: entrants ? (100 * completed) / entrants : null,
					derivation:
						"notCompleted = entrants - completed; conversionPercent = 100 * completed / entrants. Not-completed counts do not establish attempts, causes or failed tasks.",
				},
			];
		}
		if (read.name !== "get_funnel_analytics_by_referrer") {
			return [];
		}
		const parsed = z
			.object({ referrer_analytics: z.array(referrerSchema) })
			.safeParse(read.output);
		if (!parsed.success) {
			return [];
		}
		const scope = referrerScopeSchema.safeParse(read.input);
		return parsed.data.referrer_analytics
			.filter((row) => row.completed_users <= row.total_users)
			.map((row) => {
				const prior =
					scope.success &&
					scope.data.startDate === snapshot.signal.period.current.from &&
					scope.data.endDate === snapshot.signal.period.current.to
						? previousRates.get(
								JSON.stringify([
									scope.data.websiteId,
									scope.data.funnelId,
									scope.data.cohort ?? null,
									row.referrer,
								])
							)
						: null;
				const percent = row.total_users
					? (100 * row.completed_users) / row.total_users
					: null;
				return {
					source: { toolCallId: read.toolCallId, resultKey: read.resultKey },
					scope: {
						...z.record(z.string(), z.json()).parse(read.input),
						referrer: row.referrer,
					},
					population: "funnel entrants",
					entrants: row.total_users,
					completed: row.completed_users,
					notCompleted: row.total_users - row.completed_users,
					conversionPercent: percent,
					changeFromPrevious:
						prior && percent !== null
							? {
									previousSource: prior.source,
									previousPercent: prior.percent,
									changePercentagePoints: percent - prior.percent,
									derivation:
										"Current minus previous conversion, computed from integer counts before rounding. Round only the final displayed difference; this does not establish a cause.",
								}
							: null,
					derivation:
						"Per-referrer counts; notCompleted = total_users - completed_users. Rows may be ranked/limited and do not establish the complete funnel population.",
				};
			});
	});
}
