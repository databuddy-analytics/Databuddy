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
		if (snapshot.limitations.length < 16) {
			snapshot.limitations.push(message.slice(0, 256));
		}
	};
	for (const value of input.evidence) {
		const text = String(snapshotJson(value));
		const bytes = Buffer.byteLength(JSON.stringify(text)) + 1;
		if (usedBytes + bytes > dataBudget) {
			limitation(
				"Some supplied context was omitted due to the saved-evidence size limit; absence cannot establish a fact."
			);
		} else {
			snapshot.providedEvidence.push(text);
			usedBytes += bytes;
		}
	}
	for (const read of input.reads) {
		if (read.toolName === "finish_investigation") {
			continue;
		}
		const parsed = z
			.object({ results: z.record(z.string(), z.unknown()) })
			.safeParse(read.output);
		const outputs: [string | null, unknown][] =
			read.toolName === "get_data" && parsed.success
				? Object.entries(parsed.data.results)
				: [[null, read.output]];
		for (const [resultKey, output] of outputs) {
			if (
				output == null ||
				(typeof output === "object" &&
					(("error" in output && output.error != null) ||
						("success" in output && output.success === false)))
			) {
				limitation(
					`${read.toolName}/${read.toolCallId}${resultKey ? `/${resultKey}` : ""}: no successful result; unavailable is not zero.`
				);
				continue;
			}
			const record = {
				name: read.toolName,
				toolCallId: read.toolCallId,
				resultKey,
				description: input.descriptions[read.toolName] ?? null,
				input: snapshotJson(read.input),
				output: snapshotJson(output),
			};

			const bytes = Buffer.byteLength(JSON.stringify(record)) + 1;
			if (usedBytes + bytes > dataBudget) {
				limitation(
					`${read.toolName}/${read.toolCallId}: result omitted due to the saved-evidence size limit; no complete population claim is supported by that omission.`
				);
			} else {
				snapshot.reads.push(record);
				usedBytes += bytes;
			}
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
	cohort: z.string().nullable().optional(),
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
