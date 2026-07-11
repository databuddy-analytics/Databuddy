import {
	and,
	db,
	eq,
	normalizeEmailNotificationSettings,
	withTransaction,
} from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import { uptimeSchedules } from "@databuddy/db/schema";
import { config } from "@databuddy/env/app";
import {
	NotificationClient,
	buildAlarmNotificationTargets,
} from "@databuddy/notifications";
import { Cache, Context, Data, Duration, Effect, Layer, Option } from "effect";
import type { ScheduleData } from "./actions";
import { UPTIME_ENV } from "./lib/env";
import { captureError } from "./lib/tracing";
import { MonitorStatus, type UptimeData } from "./types";

class TransitionClaimError extends Data.TaggedError("TransitionClaimError")<{
	cause: unknown;
}> {}

class TransitionReleaseError extends Data.TaggedError(
	"TransitionReleaseError"
)<{
	cause: unknown;
}> {}

class AlarmLookupError extends Data.TaggedError("AlarmLookupError")<{
	cause: unknown;
}> {}

class NotificationSendError extends Data.TaggedError("NotificationSendError")<{
	alarmId: string;
	channel: string;
	cause: unknown;
}> {}

interface LinkedAlarm {
	destinations: Array<{ type: string; identifier: string; config: unknown }>;
	id: string;
}

interface ClaimedTransition {
	kind: "down" | "recovered";
	previousStatus: number | null;
}

type TransitionNotificationPayload = Parameters<NotificationClient["send"]>[0];

export interface TransitionResult {
	alarms_fired: number;
	transition_kind: "down" | "recovered" | null;
}

const NO_TRANSITION: TransitionResult = {
	alarms_fired: 0,
	transition_kind: null,
};

export function resolveTransitionKind(
	previous: number | undefined,
	current: number
): "down" | "recovered" | null {
	if (current === MonitorStatus.UP) {
		if (previous === MonitorStatus.DOWN) {
			return "recovered";
		}
		return null;
	}
	if (current === MonitorStatus.DOWN) {
		if (previous === MonitorStatus.DOWN) {
			return null;
		}
		return "down";
	}
	return null;
}

export function countFiredAlarms(deliveryCounts: number[]): number {
	return deliveryCounts.filter((count) => count > 0).length;
}

export function shouldReleaseTransitionClaim(
	sendableAlarmCount: number,
	firedAlarmCount: number
): boolean {
	return sendableAlarmCount > 0 && firedAlarmCount === 0;
}

function buildSiteLabel(schedule: ScheduleData): string {
	const w = schedule.website;
	if (w?.name) {
		return w.name;
	}
	if (w?.domain) {
		return w.domain;
	}
	if (schedule.name) {
		return schedule.name;
	}
	try {
		return new URL(schedule.url).hostname;
	} catch {
		return schedule.url;
	}
}

function formatCheckedAt(timestamp: number): string {
	if (!Number.isFinite(timestamp)) {
		return "an unknown time";
	}
	const checkedAt = new Date(timestamp);
	return Number.isNaN(checkedAt.valueOf())
		? "an unknown time"
		: checkedAt.toISOString();
}

function formatCheckError(error: string): string | undefined {
	const normalized = error.replaceAll(/[\r\n]+/g, " ").trim();
	if (!normalized) {
		return;
	}
	return normalized.length > 200 ? `${normalized.slice(0, 199)}…` : normalized;
}

export function buildTransitionNotificationPayload(input: {
	dashboardUrl: string;
	data: UptimeData;
	kind: "down" | "recovered";
	monitorId: string;
	siteLabel: string;
}): TransitionNotificationPayload {
	const checkedAt = formatCheckedAt(input.data.timestamp);
	const error = formatCheckError(input.data.error);
	const checkContext = [
		`Checked at ${checkedAt}`,
		input.data.http_code > 0
			? `HTTP ${input.data.http_code}`
			: "No HTTP response",
		error ? `Reason: ${error}` : null,
	]
		.filter((value): value is string => value !== null)
		.join(" · ");

	return {
		title:
			input.kind === "down"
				? `Health check failed: ${input.siteLabel}`
				: `Health check passed: ${input.siteLabel}`,
		message:
			input.kind === "down"
				? `A health check failed for ${input.siteLabel}. ${checkContext}. View details: ${input.dashboardUrl}`
				: `A health check passed for ${input.siteLabel} after a previous failed check. Checked at ${checkedAt} · Response time ${input.data.total_ms} ms. View details: ${input.dashboardUrl}`,
		priority: input.kind === "down" ? "high" : "normal",
		metadata: {
			template: "uptime-transition",
			monitorId: input.monitorId,
			monitorName: input.siteLabel,
			url: input.data.url,
			kind: input.kind,
			httpCode: input.data.http_code,
			dashboardUrl: input.dashboardUrl,
		},
	};
}

const AlarmCache =
	Context.Service<Cache.Cache<string, LinkedAlarm[], AlarmLookupError>>(
		"AlarmCache"
	);

const AlarmCacheLive = Layer.effect(
	AlarmCache,
	Cache.make({
		capacity: 256,
		timeToLive: Duration.seconds(30),
		lookup: (key: string) => {
			const [organizationId, scheduleId] = key.split(":", 2);
			if (!(organizationId && scheduleId)) {
				return Effect.succeed([]);
			}
			return Effect.tryPromise({
				try: async () => {
					const rows = await db.query.alarms.findMany({
						where: { organizationId, enabled: true },
						with: { destinations: true },
					});

					return rows.filter((alarm) => {
						const tc = alarm.triggerConditions as Record<
							string,
							unknown
						> | null;
						const monitorIds = Array.isArray(tc?.monitorIds)
							? tc.monitorIds
							: [];
						return monitorIds.some((id) => id === scheduleId);
					}) as LinkedAlarm[];
				},
				catch: (cause) => new AlarmLookupError({ cause }),
			});
		},
	})
);

const lookupLinkedAlarms = (scheduleId: string, organizationId: string) =>
	Effect.gen(function* () {
		const cache = yield* AlarmCache;
		return yield* Cache.get(cache, `${organizationId}:${scheduleId}`);
	});

const claimTransition = (scheduleId: string, currentStatus: number) =>
	Effect.tryPromise({
		try: () =>
			withTransaction(async (tx) => {
				const [row] = await tx
					.select({ last: uptimeSchedules.lastNotifiedStatus })
					.from(uptimeSchedules)
					.where(eq(uptimeSchedules.id, scheduleId))
					.for("update");

				if (!row) {
					return null;
				}

				const kind = resolveTransitionKind(
					row.last ?? undefined,
					currentStatus
				);
				if (kind === null) {
					return null;
				}

				await tx
					.update(uptimeSchedules)
					.set({ lastNotifiedStatus: currentStatus })
					.where(eq(uptimeSchedules.id, scheduleId));

				return { kind, previousStatus: row.last } satisfies ClaimedTransition;
			}),
		catch: (cause) => new TransitionClaimError({ cause }),
	});

const releaseTransitionClaim = (input: {
	currentStatus: number;
	previousStatus: number | null;
	scheduleId: string;
}) =>
	Effect.tryPromise({
		try: () =>
			db
				.update(uptimeSchedules)
				.set({ lastNotifiedStatus: input.previousStatus })
				.where(
					and(
						eq(uptimeSchedules.id, input.scheduleId),
						eq(uptimeSchedules.lastNotifiedStatus, input.currentStatus)
					)
				),
		catch: (cause) => new TransitionReleaseError({ cause }),
	});

async function getOrganizationEmailSettings(organizationId: string) {
	const row = await db.query.organization.findFirst({
		where: { id: organizationId },
		columns: { emailNotifications: true },
	});
	return normalizeEmailNotificationSettings(row?.emailNotifications);
}

function filterUptimeEmailDestinations(
	alarm: LinkedAlarm,
	emailsEnabled: boolean
): LinkedAlarm {
	if (emailsEnabled) {
		return alarm;
	}
	return {
		...alarm,
		destinations: alarm.destinations.filter((dest) => dest.type !== "email"),
	};
}

const sendToAlarm = (
	alarm: LinkedAlarm,
	payload: Parameters<NotificationClient["send"]>[0]
) => {
	const targets = buildAlarmNotificationTargets(alarm.destinations);
	if (targets.length === 0) {
		return Effect.succeed(0);
	}

	return Effect.gen(function* () {
		const results = yield* Effect.all(
			targets.map((target) =>
				Effect.tryPromise({
					try: () =>
						new NotificationClient(target.clientConfig).send(payload, {
							channels: [target.channel],
						}),
					catch: (cause) =>
						new NotificationSendError({
							alarmId: alarm.id,
							channel: target.channel,
							cause,
						}),
				}).pipe(
					Effect.map((deliveryResults) => {
						let successes = 0;
						for (const result of deliveryResults) {
							if (result.success) {
								successes += 1;
							} else {
								captureError(
									new Error(
										result.error ??
											`Notification delivery failed for ${result.channel}`
									),
									{
										error_step: "alarm_notification_result",
										alarm_id: alarm.id,
										channel: result.channel,
									}
								);
							}
						}
						return successes;
					}),
					Effect.catchTag("NotificationSendError", (e) => {
						captureError(e.cause, {
							error_step: "alarm_notification",
							alarm_id: e.alarmId,
							channel: e.channel,
						});
						return Effect.succeed(0);
					})
				)
			),
			{ concurrency: "unbounded" }
		);
		return results.reduce((total, count) => total + count, 0);
	});
};

export const queryPreviousStatus = (siteId: string) =>
	Effect.gen(function* () {
		if (!process.env.CLICKHOUSE_URL) {
			return Option.none<number>();
		}

		const rows = yield* Effect.tryPromise(() =>
			chQuery<{ status: number }>(
				`SELECT status
       FROM uptime.uptime_monitor
       WHERE site_id = {siteId:String}
       ORDER BY timestamp DESC
       LIMIT 1`,
				{ siteId }
			)
		).pipe(Effect.orElseSucceed(() => [] as { status: number }[]));

		const first = rows[0];
		return first ? Option.some(first.status) : Option.none<number>();
	});

const handleTransition = (options: {
	schedule: ScheduleData;
	data: UptimeData;
	previousStatus?: number;
}) =>
	Effect.gen(function* () {
		if (!UPTIME_ENV.isProduction) {
			return NO_TRANSITION;
		}

		const claim = yield* claimTransition(
			options.schedule.id,
			options.data.status
		).pipe(
			Effect.catchTag("TransitionClaimError", (e) => {
				captureError(e.cause, { error_step: "transition_claim" });
				return Effect.succeed(null);
			})
		);

		if (claim === null) {
			return NO_TRANSITION;
		}
		const { kind } = claim;
		const releaseClaim = releaseTransitionClaim({
			currentStatus: options.data.status,
			previousStatus: claim.previousStatus,
			scheduleId: options.schedule.id,
		}).pipe(
			Effect.catchTag("TransitionReleaseError", (error) => {
				captureError(error.cause, {
					error_step: "transition_claim_release",
					schedule_id: options.schedule.id,
				});
				return Effect.void;
			})
		);

		const linkedAlarms = yield* lookupLinkedAlarms(
			options.schedule.id,
			options.schedule.organizationId
		).pipe(
			Effect.catchTag("AlarmLookupError", (e) => {
				captureError(e.cause, { error_step: "alarm_lookup" });
				return Effect.succeed(null);
			})
		);
		if (linkedAlarms === null) {
			yield* releaseClaim;
			return { alarms_fired: 0, transition_kind: kind };
		}

		if (linkedAlarms.length === 0) {
			return { alarms_fired: 0, transition_kind: kind };
		}

		const emailSettings = yield* Effect.tryPromise(() =>
			getOrganizationEmailSettings(options.schedule.organizationId)
		).pipe(
			Effect.catch((error) => {
				captureError(error, {
					error_step: "organization_email_settings",
					organization_id: options.schedule.organizationId,
				});
				return Effect.succeed(null);
			})
		);
		const emailsEnabled =
			emailSettings !== null &&
			(kind === "down"
				? emailSettings.uptime.downEmails
				: emailSettings.uptime.recoveryEmails);

		const siteLabel = buildSiteLabel(options.schedule);
		const dashboardUrl = `${config.urls.dashboard}/monitors/${options.schedule.id}`;

		const payload = buildTransitionNotificationPayload({
			dashboardUrl,
			data: options.data,
			kind,
			monitorId: options.schedule.id,
			siteLabel,
		});

		const sendable = linkedAlarms
			.map((alarm) => filterUptimeEmailDestinations(alarm, emailsEnabled))
			.filter((alarm) => alarm.destinations.length > 0);

		const results = yield* Effect.all(
			sendable.map((alarm) => sendToAlarm(alarm, payload)),
			{ concurrency: "unbounded" }
		);

		const fired = countFiredAlarms(results);
		if (shouldReleaseTransitionClaim(sendable.length, fired)) {
			yield* releaseClaim;
		}
		return { alarms_fired: fired, transition_kind: kind };
	});

const TransitionLive = AlarmCacheLive;

export async function getPreviousMonitorStatus(
	siteId: string
): Promise<number | undefined> {
	const option = await Effect.runPromise(queryPreviousStatus(siteId));
	return Option.getOrUndefined(option);
}

export function fireTransitionAlerts(options: {
	schedule: ScheduleData;
	data: UptimeData;
	previousStatus?: number;
}): Promise<TransitionResult> {
	return Effect.runPromise(
		handleTransition(options).pipe(Effect.provide(TransitionLive))
	);
}
