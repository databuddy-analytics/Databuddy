import { and, db, eq, withTransaction } from "@databuddy/db";
import { alarms, uptimeSchedules } from "@databuddy/db/schema";
import { chQuery } from "@databuddy/db/clickhouse";
import {
	NotificationClient,
	buildAlarmNotificationConfig,
} from "@databuddy/notifications";
import {
	Cache,
	Context,
	Data,
	Duration,
	Effect,
	Layer,
	Option,
} from "effect";
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

class NotificationSendError extends Data.TaggedError(
	"NotificationSendError",
)<{
	alarmId: string;
	cause: unknown;
}> {}

type LinkedAlarm = {
	id: string;
	destinations: Array<{ type: string; identifier: string; config: unknown }>;
};

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
	current: number,
): "down" | "recovered" | null {
	if (current === MonitorStatus.UP) {
		if (previous === MonitorStatus.DOWN) return "recovered";
		return null;
	}
	if (current === MonitorStatus.DOWN) {
		if (previous === MonitorStatus.DOWN) return null;
		return "down";
	}
	return null;
}

function buildSiteLabel(schedule: ScheduleData): string {
	const w = schedule.website;
	if (w?.name) return w.name;
	if (w?.domain) return w.domain;
	if (schedule.name) return schedule.name;
	try {
		return new URL(schedule.url).hostname;
	} catch {
		return schedule.url;
	}
}


const AlarmCache = Context.Service<
	Cache.Cache<string, LinkedAlarm[], AlarmLookupError>
>("AlarmCache");

const AlarmCacheLive = Layer.effect(
	AlarmCache,
	Cache.make({
		capacity: 256,
		timeToLive: Duration.seconds(30),
		lookup: (key: string) => {
			const [organizationId, scheduleId] = key.split(":", 2);
			return Effect.tryPromise({
				try: async () => {
					const rows = await db.query.alarms.findMany({
						where: and(
							eq(alarms.organizationId, organizationId!),
							eq(alarms.enabled, true),
						),
						with: { destinations: true },
					});

					return rows.filter((alarm) => {
						const tc = alarm.triggerConditions as Record<
							string,
							unknown
						> | null;
						return (
							tc &&
							Array.isArray(tc.monitorIds) &&
							(tc.monitorIds as string[]).includes(scheduleId!)
						);
					}) as LinkedAlarm[];
				},
				catch: (cause) => new AlarmLookupError({ cause }),
			});
		},
	}),
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

				if (!row) return null;

				const kind = resolveTransitionKind(
					row.last ?? undefined,
					currentStatus,
				);
				if (kind === null) return null;

				await tx
					.update(uptimeSchedules)
					.set({ lastNotifiedStatus: currentStatus })
					.where(eq(uptimeSchedules.id, scheduleId));

				return kind;
			}),
		catch: (cause) => new TransitionClaimError({ cause }),
	});

const sendToAlarm = (
	alarm: LinkedAlarm,
	payload: Parameters<NotificationClient["send"]>[0],
) => {
	const { clientConfig, channels } = buildAlarmNotificationConfig(
		alarm.destinations,
	);
	if (channels.length === 0) return Effect.succeed(false);

	return Effect.tryPromise({
		try: () =>
			new NotificationClient(clientConfig)
				.send(payload, { channels })
				.then(() => true),
		catch: (cause) => new NotificationSendError({ alarmId: alarm.id, cause }),
	});
};

export const queryPreviousStatus = (siteId: string) =>
	Effect.gen(function* () {
		if (!process.env.CLICKHOUSE_URL) return Option.none<number>();

		const rows = yield* Effect.tryPromise(() =>
			chQuery<{ status: number }>(
				`SELECT status
       FROM uptime.uptime_monitor
       WHERE site_id = {siteId:String}
       ORDER BY timestamp DESC
       LIMIT 1`,
				{ siteId },
			),
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
		if (!UPTIME_ENV.isProduction) return NO_TRANSITION;

		if (
			options.previousStatus !== undefined &&
			resolveTransitionKind(options.previousStatus, options.data.status) ===
				null
		) {
			return NO_TRANSITION;
		}

		const kind = yield* claimTransition(
			options.schedule.id,
			options.data.status,
		).pipe(
			Effect.catchTag("TransitionClaimError", (e) => {
				captureError(e.cause, { error_step: "transition_claim" });
				return Effect.succeed(null);
			}),
		);

		if (kind === null) return NO_TRANSITION;

		const linkedAlarms = yield* lookupLinkedAlarms(
			options.schedule.id,
			options.schedule.organizationId,
		).pipe(
			Effect.catchTag("AlarmLookupError", (e) => {
				captureError(e.cause, { error_step: "alarm_lookup" });
				return Effect.succeed([] as LinkedAlarm[]);
			}),
		);

		if (linkedAlarms.length === 0) {
			return { alarms_fired: 0, transition_kind: kind };
		}

		const siteLabel = buildSiteLabel(options.schedule);
		const baseUrl =
			process.env.DASHBOARD_APP_URL ?? "https://app.databuddy.cc";
		const dashboardUrl = `${baseUrl.replace(/\/$/, "")}/monitors/${options.schedule.id}`;

		const httpInfo = options.data.http_code
			? ` (HTTP ${options.data.http_code})`
			: "";
		const errorInfo = options.data.error
			? ` - ${options.data.error}`
			: "";

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

		const sendable = linkedAlarms.filter(
			(a) => a.destinations.length > 0,
		);

		const results = yield* Effect.all(
			sendable.map((alarm) =>
				sendToAlarm(alarm, payload).pipe(
					Effect.catchTag("NotificationSendError", (e) => {
						captureError(e.cause, {
							error_step: "alarm_notification",
							alarm_id: e.alarmId,
						});
						return Effect.succeed(false);
					}),
				),
			),
			{ concurrency: "unbounded" },
		);

		const fired = results.filter(Boolean).length;
		return { alarms_fired: fired, transition_kind: kind };
	});

const TransitionLive = AlarmCacheLive;

export async function getPreviousMonitorStatus(
	siteId: string,
): Promise<number | undefined> {
	const option = await Effect.runPromise(queryPreviousStatus(siteId));
	return Option.getOrUndefined(option);
}

export async function fireTransitionAlerts(options: {
	schedule: ScheduleData;
	data: UptimeData;
	previousStatus?: number;
}): Promise<TransitionResult> {
	return Effect.runPromise(
		handleTransition(options).pipe(Effect.provide(TransitionLive)),
	);
}
