import { createHash } from "node:crypto";
import { executeQuery, type QueryRequest } from "@databuddy/ai/query";
import { db } from "@databuddy/db";
import { readOrganizationBusinessContext } from "@databuddy/services/organization-business-context";
import type { BusinessMeasurementPlan } from "@databuddy/shared/organization-business-context";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import dayjs from "dayjs";
import { z } from "zod";
import { raceWithAbort } from "./funnel-detection";
import {
	makeWowSignal,
	type DetectedSignal,
	type DetectSignalsParams,
} from "./detection";

const count = z
	.union([z.number(), z.string().trim().min(1)])
	.pipe(z.coerce.number<string | number>().int().nonnegative().safe());
const rowSchema = z.object({
	row_type: z.enum(["overall", "cohort"]),
	cohort_date: z.iso.date().nullable(),
	activated_profiles: count,
	eligible_profiles: count,
	retained_profiles: count,
	not_retained_profiles: count,
	incomplete_profiles: count,
	activation_events: count,
	identified_activation_events: count,
	unidentified_activation_events: count,
	cohort_from: z.iso.date(),
	cohort_to: z.iso.date(),
	observation_end: z.iso.date(),
	cohort_start: z.string(),
	cohort_end: z.string(),
	observed_before: z.string(),
	timezone: z.string(),
	horizon_days: z.coerce.number(),
	identity_basis: z.literal("direct_profile_id"),
	activation_basis: z.literal("first_in_cohort_window"),
});

export function measurementPlanKey(plan: BusinessMeasurementPlan): string {
	return `retention:${createHash("sha256")
		.update(
			JSON.stringify([
				plan.websiteId,
				plan.domain,
				plan.activationEvent,
				plan.returnEvent,
				plan.horizonDays,
				plan.namespace ?? null,
			])
		)
		.digest("hex")
		.slice(0, 24)}`;
}

async function readPlan(
	websiteId: string,
	asOf: Date,
	abortSignal?: AbortSignal
) {
	abortSignal?.throwIfAborted();
	const website = await db.query.websites.findFirst({
		where: { id: websiteId, deletedAt: { isNull: true } },
		columns: { organizationId: true, domain: true },
	});
	abortSignal?.throwIfAborted();
	if (!website?.organizationId) {
		return null;
	}
	const { profile } = await readOrganizationBusinessContext(
		website.organizationId
	);
	abortSignal?.throwIfAborted();
	if (!profile || Date.parse(profile.updatedAt) > asOf.getTime()) {
		return null;
	}
	return (
		profile.measurementPlans?.find(
			(plan) => plan.websiteId === websiteId && plan.domain === website.domain
		) ?? null
	);
}

/** Measure each week independently so repeat activators are eligible in both weeks. */
export async function measureActivationRetention(
	plan: BusinessMeasurementPlan,
	timezone: string,
	asOf: dayjs.Dayjs,
	query: typeof executeQuery = executeQuery,
	abortSignal?: AbortSignal
) {
	const today = asOf.tz(timezone).startOf("day");
	// A full extra calendar day leaves room for a DST change in the fixed-hour horizon.
	const currentTo = today.subtract(plan.horizonDays + 2, "day");
	const currentFrom = currentTo.subtract(6, "day").format("YYYY-MM-DD");
	const from = currentTo.subtract(13, "day").format("YYYY-MM-DD");
	const to = currentTo.format("YYYY-MM-DD");
	const observationEnd = today.subtract(1, "day").format("YYYY-MM-DD");
	const period = {
		current: { from: currentFrom, to },
		previous: { from, to: currentTo.subtract(7, "day").format("YYYY-MM-DD") },
	};
	async function window({ from, to }: { from: string; to: string }) {
		const request: QueryRequest = {
			projectId: plan.websiteId,
			type: "identified_profile_retention",
			from,
			to,
			timezone,
			limit: 100,
			filters: [
				{ field: "activation_event", op: "eq", value: plan.activationEvent },
				{ field: "return_event", op: "eq", value: plan.returnEvent },
				{ field: "horizon_days", op: "eq", value: plan.horizonDays },
				{ field: "observation_end", op: "eq", value: observationEnd },
				...(plan.namespace
					? [{ field: "namespace", op: "eq" as const, value: plan.namespace }]
					: []),
			],
		};
		const rows = z
			.array(rowSchema)
			.min(1)
			.max(8)
			.parse(await query(request, plan.domain, timezone, abortSignal));
		const overall = rows.filter((row) => row.row_type === "overall");
		const daily = rows.filter((row) => row.row_type === "cohort");
		const start = dayjs.tz(from, timezone).valueOf();
		const end = dayjs.tz(to, timezone).add(1, "day").startOf("day").valueOf();
		if (
			overall.length !== 1 ||
			overall[0].cohort_date !== null ||
			new Set(daily.map((row) => row.cohort_date)).size !== daily.length ||
			rows.some(
				(row) =>
					row.cohort_from !== from ||
					row.cohort_to !== to ||
					row.observation_end !== observationEnd ||
					row.timezone !== timezone ||
					row.horizon_days !== plan.horizonDays ||
					Date.parse(row.cohort_start) !== start ||
					Date.parse(row.cohort_end) !== end ||
					Date.parse(row.observed_before) !== today.valueOf() ||
					row.activated_profiles > row.identified_activation_events ||
					row.eligible_profiles + row.incomplete_profiles !==
						row.activated_profiles ||
					row.retained_profiles + row.not_retained_profiles !==
						row.eligible_profiles ||
					row.identified_activation_events +
						row.unidentified_activation_events !==
						row.activation_events ||
					(row.row_type === "cohort" &&
						(!row.cohort_date ||
							row.cohort_date < from ||
							row.cohort_date > to))
			)
		) {
			throw new Error(
				"Retention returned a different or inconsistent measured population"
			);
		}
		const fields = [
			"activated_profiles",
			"eligible_profiles",
			"retained_profiles",
			"not_retained_profiles",
			"incomplete_profiles",
			"activation_events",
			"identified_activation_events",
			"unidentified_activation_events",
		] as const;
		if (
			fields.some(
				(field) =>
					daily.reduce((sum, row) => sum + row[field], 0) !== overall[0][field]
			)
		) {
			throw new Error("Retention cohort rows are incomplete");
		}
		return {
			eligible: overall[0].eligible_profiles,
			retained: overall[0].retained_profiles,
			incomplete: overall[0].incomplete_profiles,
			events: overall[0].activation_events,
			identifiedEvents: overall[0].identified_activation_events,
			observedBefore: overall[0].observed_before,
			request,
		};
	}
	const [previous, current] = await Promise.all([
		window(period.previous),
		window(period.current),
	]);
	return { period, previous, current, observedBefore: current.observedBefore };
}

export async function detectRetentionSignals(
	params: DetectSignalsParams,
	asOf: dayjs.Dayjs,
	abortSignal?: AbortSignal,
	dependencies: {
		readPlan?: typeof readPlan;
		query?: typeof executeQuery;
	} = {},
	prior?: InvestigationSignal
): Promise<DetectedSignal[]> {
	const signal = abortSignal ?? AbortSignal.timeout(45_000);
	const plan = await raceWithAbort(
		() =>
			(dependencies.readPlan ?? readPlan)(
				params.websiteId,
				asOf.toDate(),
				signal
			),
		signal
	);
	if (
		!plan ||
		plan.websiteId !== params.websiteId ||
		(prior && prior.signalKey !== measurementPlanKey(plan))
	) {
		return [];
	}
	const measured = await measureActivationRetention(
		plan,
		params.timezone,
		asOf,
		dependencies.query,
		signal
	);
	const { previous, current, period } = measured;
	if (
		previous.incomplete ||
		current.incomplete ||
		previous.eligible < 50 ||
		current.eligible < 50
	) {
		return [];
	}
	const before = previous.retained / previous.eligible;
	const after = current.retained / current.eligible;
	const difference = Math.abs(after - before);
	const error = Math.sqrt(
		(before * (1 - before)) / previous.eligible +
			(after * (1 - after)) / current.eligible
	);
	if (
		!prior &&
		(difference < 0.1 ||
			difference < 3 * error ||
			difference * Math.min(previous.eligible, current.eligible) < 10)
	) {
		return [];
	}
	return [
		{
			...makeWowSignal(
				"identified_retention",
				`${plan.name}: return within ${plan.horizonDays} days`,
				after * 100,
				before * 100,
				period.current.to,
				{ round: true }
			),
			subjectKey: measurementPlanKey(plan),
			entityLabel: plan.name,
			period,
			investigationObjective:
				"Explain the measured return-within-window change for this saved team definition. The supplied native comparison already contains both complete cohorts and identity coverage; use further reads only to answer a distinct unresolved question. Keep identified profiles separate from people, accounts, anonymous visitors, new customers, and subscription churn. Cause remains unknown without inspected evidence.",
			evidence: [
				`Team-defined measure ${JSON.stringify(plan.name)}: activation event ${JSON.stringify(plan.activationEvent)}, return event ${JSON.stringify(plan.returnEvent)}, namespace ${JSON.stringify(plan.namespace ?? "all")}. This supplies business meaning; it is not an inspection of emitter code.`,
				`Native identified_profile_retention: ${period.previous.from}–${period.previous.to}: ${previous.retained}/${previous.eligible} eligible identified profiles returned; ${period.current.from}–${period.current.to}: ${current.retained}/${current.eligible}. Return is strictly after activation and within ${plan.horizonDays}×24 hours. Both cohorts have complete follow-up, observed before ${measured.observedBefore} (${params.timezone}).`,
				`Activation events with direct profile identity: ${previous.identifiedEvents}/${previous.events} in the earlier cohort dates; ${current.identifiedEvents}/${current.events} in the later dates. These are event counts, not population coverage. Anonymous events are outside the profile denominator. Activation is the first matching event within each week independently, not first-ever activation. A profile can appear in both weeks; this is not a paired-profile or new-customer comparison.`,
			],
		},
	];
}
