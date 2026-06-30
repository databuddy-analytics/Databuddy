import {
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

				return kind;
			}),
		catch: (cause) => new TransitionClaimError({ cause }),
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

		if (
			options.previousStatus !== undefined &&
			resolveTransitionKind(options.previousStatus, options.data.status) ===
				null
		) {
			return NO_TRANSITION;
		}

		const kind = yield* claimTransition(
			options.schedule.id,
			options.data.status
		).pipe(
			Effect.catchTag("TransitionClaimError", (e) => {
				captureError(e.cause, { error_step: "transition_claim" });
				return Effect.succeed(null);
			})
		);

		if (kind === null) {
			return NO_TRANSITION;
		}

		const linkedAlarms = yield* lookupLinkedAlarms(
			options.schedule.id,
			options.schedule.organizationId
		).pipe(
			Effect.catchTag("AlarmLookupError", (e) => {
				captureError(e.cause, { error_step: "alarm_lookup" });
				return Effect.succeed([] as LinkedAlarm[]);
			})
		);

		if (linkedAlarms.length === 0) {
			return { alarms_fired: 0, transition_kind: kind };
		}

		const emailSettings = yield* Effect.tryPromise(() =>
			getOrganizationEmailSettings(options.schedule.organizationId)
		).pipe(
			Effect.orElseSucceed(() => normalizeEmailNotificationSettings(null))
		);
		const emailsEnabled =
			kind === "down"
				? emailSettings.uptime.downEmails
				: emailSettings.uptime.recoveryEmails;

		const siteLabel = buildSiteLabel(options.schedule);
		const dashboardUrl = `${config.urls.dashboard}/monitors/${options.schedule.id}`;

		const httpInfo = options.data.http_code
			? ` (HTTP ${options.data.http_code})`
			: "";
		const errorInfo = options.data.error ? ` - ${options.data.error}` : "";

		const payload = {
			title:
				kind === "down"
					? `[DOWN] ${siteLabel} is unreachable`
					: `[Recovered] ${siteLabel} is back up`,
			message:
				kind === "down"
					? `${siteLabel} is down${httpInfo}${errorInfo}. View details: ${dashboardUrl}`
					: `${siteLabel} has recovered and is operational again. Response time: ${options.data.total_ms}ms. View details: ${dashboardUrl}`,
			priority: kind === "down" ? ("high" as const) : ("normal" as const),
			metadata: {
				template: "uptime-transition" as const,
				monitorId: options.schedule.id,
				monitorName: siteLabel,
				url: options.data.url,
				kind,
				httpCode: options.data.http_code,
				dashboardUrl,
			},
		};

		const sendable = linkedAlarms
			.map((alarm) => filterUptimeEmailDestinations(alarm, emailsEnabled))
			.filter((alarm) => alarm.destinations.length > 0);

		const results = yield* Effect.all(
			sendable.map((alarm) => sendToAlarm(alarm, payload)),
			{ concurrency: "unbounded" }
		);

		const fired = results.reduce((total, count) => total + count, 0);
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
