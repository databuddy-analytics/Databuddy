import dayjs from "dayjs";
import {
	sendDiscordWebhook,
	sendEmail,
	sendSlackWebhook,
	sendWebhook,
	type NotificationPayload,
	type NotificationResult,
} from "@databuddy/notifications";
import { createId } from "@databuddy/shared/utils/ids";
import { Resend } from "resend";
import { captureError } from "./lib/tracing";
import type { UptimeData } from "./types";

const DEFAULT_FAILURE_THRESHOLD = 3;
const DASHBOARD_BASE_URL =
	process.env.NEXT_PUBLIC_APP_URL ?? "https://app.databuddy.cc";

const resendClient = process.env.RESEND_API_KEY
	? new Resend(process.env.RESEND_API_KEY)
	: null;

const defaultFromEmail =
	process.env.NOTIFICATIONS_FROM_EMAIL ?? "Databuddy <noreply@databuddy.cc>";

export type AlarmTriggerConditions = {
	failureThreshold?: number;
	responseTimeMs?: number;
};

export type AlarmTriggerDetails = {
	url?: string;
	status?: "down" | "up";
	detectedAt?: string;
	httpStatus?: number;
	responseTimeMs?: number;
	consecutiveFailures?: number;
	downtimeDurationMs?: number;
	dashboardUrl?: string;
};

export type AlarmRecord = {
	id: string;
	userId: string;
	organizationId: string;
	websiteId: string | null;
	name: string;
	description: string | null;
	enabled: boolean;
	notificationChannels: Array<"slack" | "discord" | "email" | "webhook">;
	slackWebhookUrl: string | null;
	discordWebhookUrl: string | null;
	emailAddresses: string[];
	webhookUrl: string | null;
	webhookHeaders: Record<string, string> | null;
	triggerType: "uptime" | "traffic_spike" | "error_rate" | "goal" | "custom";
	triggerConditions: AlarmTriggerConditions;
	createdAt: Date;
	updatedAt: Date;
};

export type AlarmStateRecord = {
	alarmId: string;
	websiteId: string;
	status: "up" | "down";
	consecutiveFailures: number;
	downStartedAt: Date | null;
	lastCheckedAt: Date;
	updatedAt: Date;
};

type AlarmStateUpsert = AlarmStateRecord;

type AlarmTriggerHistoryEntry = {
	id: string;
	alarmId: string;
	websiteId: string;
	status: "down" | "up";
	details: AlarmTriggerDetails;
	triggeredAt: Date;
};

export type AlarmNotificationSenders = {
	slack: (
		url: string,
		payload: NotificationPayload
	) => Promise<NotificationResult>;
	discord: (
		url: string,
		payload: NotificationPayload
	) => Promise<NotificationResult>;
	email: (
		payload: NotificationPayload & { to: string | string[] }
	) => Promise<NotificationResult>;
	webhook: (
		url: string,
		payload: NotificationPayload,
		headers: Record<string, string>
	) => Promise<NotificationResult>;
};

export function createNotificationSenders(): AlarmNotificationSenders {
	return {
		slack: (url, payload) => sendSlackWebhook(url, payload),
		discord: (url, payload) => sendDiscordWebhook(url, payload),
		email: (payload) =>
			sendEmail(
				async (emailPayload) => {
					if (!resendClient) {
						throw new Error("Email provider is not configured");
					}
					await resendClient.emails.send({
						from: defaultFromEmail,
						...emailPayload,
					});
				},
				payload,
				{ from: defaultFromEmail }
			),
		webhook: (url, payload, headers) => sendWebhook(url, payload, { headers }),
	};
}

function buildDashboardUrl(websiteId: string): string {
	return `${DASHBOARD_BASE_URL}/websites/${websiteId}/uptime`;
}

function formatTimestamp(value: Date): string {
	return dayjs(value).format("YYYY-MM-DD HH:mm:ss");
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const remainingHours = hours % 24;
	const remainingMinutes = minutes % 60;
	const remainingSeconds = totalSeconds % 60;

	if (days > 0) {
		return `${days}d ${remainingHours}h ${remainingMinutes}m`;
	}
	if (hours > 0) {
		return `${hours}h ${remainingMinutes}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${remainingSeconds}s`;
	}
	return `${remainingSeconds}s`;
}

function normalizeHeaders(headers: Record<string, string> | null): Record<string, string> {
	if (!headers) {
		return {};
	}
	const trimmedEntries = Object.entries(headers)
		.map(([key, value]) => [key.trim(), value.trim()])
		.filter(([key, value]) => key.length > 0 && value.length > 0);
	return Object.fromEntries(trimmedEntries);
}

function getFailureThreshold(conditions: AlarmTriggerConditions | null): number {
	const candidate = conditions?.failureThreshold;
	if (!candidate || candidate < 1) {
		return DEFAULT_FAILURE_THRESHOLD;
	}
	return candidate;
}

export function evaluateAlarmState(params: {
	previous: AlarmStateRecord | null;
	isDown: boolean;
	failureThreshold: number;
	checkedAt: Date;
}): {
	status: "up" | "down";
	consecutiveFailures: number;
	downStartedAt: Date | null;
	shouldNotifyDown: boolean;
	shouldNotifyUp: boolean;
	downtimeDurationMs: number | null;
} {
	const { previous, isDown, failureThreshold, checkedAt } = params;
	const prevStatus = previous?.status ?? "up";
	const prevFailures = previous?.consecutiveFailures ?? 0;
	const prevDownStartedAt = previous?.downStartedAt ?? null;

	if (isDown) {
		const nextFailures = prevFailures + 1;
		const downStartedAt = prevDownStartedAt ?? checkedAt;
		const reachedThreshold = nextFailures >= failureThreshold;
		const shouldNotifyDown = prevStatus === "up" && reachedThreshold;
		const status = prevStatus === "down" || reachedThreshold ? "down" : "up";

		return {
			status,
			consecutiveFailures: nextFailures,
			downStartedAt,
			shouldNotifyDown,
			shouldNotifyUp: false,
			downtimeDurationMs: null,
		};
	}

	const shouldNotifyUp = prevStatus === "down";
	const downtimeDurationMs = shouldNotifyUp && prevDownStartedAt
		? dayjs(checkedAt).diff(prevDownStartedAt)
		: null;

	return {
		status: "up",
		consecutiveFailures: 0,
		downStartedAt: null,
		shouldNotifyDown: false,
		shouldNotifyUp,
		downtimeDurationMs,
	};
}

export function buildDownPayload(details: AlarmTriggerDetails): NotificationPayload {
	const metadata: Record<string, string> = {
		Website: details.url ?? "",
		"Detected at": details.detectedAt ?? "",
		"Consecutive failures": String(details.consecutiveFailures ?? 0),
		Dashboard: details.dashboardUrl ?? "",
	};
	if (details.httpStatus !== undefined) {
		metadata["HTTP status"] = String(details.httpStatus);
	}
	if (details.responseTimeMs !== undefined) {
		metadata["Response time"] = `${details.responseTimeMs} ms`;
	}

	return {
		title: `🔴 Site Down: ${details.url ?? ""}`,
		message:
			"We detected consecutive failures for your monitored site. Please investigate the outage.",
		priority: "urgent",
		metadata,
	};
}

export function buildUpPayload(details: AlarmTriggerDetails): NotificationPayload {
	const metadata: Record<string, string> = {
		Website: details.url ?? "",
		"Recovered at": details.detectedAt ?? "",
		Downtime: details.downtimeDurationMs
			? formatDuration(details.downtimeDurationMs)
			: "Unknown",
		Dashboard: details.dashboardUrl ?? "",
	};

	return {
		title: `🟢 Site Recovered: ${details.url ?? ""}`,
		message: "Your site is back online and responding normally.",
		priority: "normal",
		metadata,
	};
}

export async function sendNotifications(
	alarm: AlarmRecord,
	payload: NotificationPayload,
	senders: AlarmNotificationSenders
): Promise<NotificationResult[]> {
	const results: NotificationResult[] = [];
	const headers = normalizeHeaders(alarm.webhookHeaders ?? null);

	for (const channel of alarm.notificationChannels) {
		try {
			switch (channel) {
				case "slack":
					if (alarm.slackWebhookUrl) {
						results.push(
							await senders.slack(alarm.slackWebhookUrl, payload)
						);
					}
					break;
				case "discord":
					if (alarm.discordWebhookUrl) {
						results.push(
							await senders.discord(alarm.discordWebhookUrl, payload)
						);
					}
					break;
				case "email":
					if (alarm.emailAddresses.length > 0) {
						results.push(
							await senders.email({
								...payload,
								to: alarm.emailAddresses,
								metadata: {
									...payload.metadata,
									to: alarm.emailAddresses,
								},
							})
						);
					}
					break;
				case "webhook":
					if (alarm.webhookUrl) {
						results.push(
							await senders.webhook(alarm.webhookUrl, payload, headers)
						);
					}
					break;
				default:
					break;
			}
		} catch (error) {
			captureError(error, {
				type: "uptime_alarm_notification_failed",
				alarmId: alarm.id,
				channel,
			});
		}
	}

	return results;
}

type AlarmProcessorDeps = {
	fetchAlarms: (websiteId: string) => Promise<AlarmRecord[]>;
	fetchStates: (
		alarmIds: string[],
		websiteId: string
	) => Promise<AlarmStateRecord[]>;
	upsertState: (state: AlarmStateUpsert) => Promise<void>;
	logHistory: (entry: AlarmTriggerHistoryEntry) => Promise<void>;
	senders: AlarmNotificationSenders;
};

export async function processUptimeAlarmsWithDeps(
	uptimeData: UptimeData,
	websiteId: string | null,
	deps: AlarmProcessorDeps
): Promise<void> {
	if (!websiteId) {
		return;
	}

	const activeAlarms = await deps.fetchAlarms(websiteId);

	if (activeAlarms.length === 0) {
		return;
	}

	const alarmIds = activeAlarms.map((alarm) => alarm.id);
	const existingStates = await deps.fetchStates(alarmIds, websiteId);
	const stateByAlarmId = new Map(
		existingStates.map((state) => [state.alarmId, state])
	);

	const isDown = uptimeData.status === 0;
	const checkedAt = new Date(uptimeData.timestamp);
	const dashboardUrl = buildDashboardUrl(websiteId);

	for (const alarm of activeAlarms) {
		const previousState = stateByAlarmId.get(alarm.id) ?? null;
		const failureThreshold = getFailureThreshold(alarm.triggerConditions ?? null);
		const evaluation = evaluateAlarmState({
			previous: previousState,
			isDown,
			failureThreshold,
			checkedAt,
		});

		await deps.upsertState({
			alarmId: alarm.id,
			websiteId,
			status: evaluation.status,
			consecutiveFailures: evaluation.consecutiveFailures,
			downStartedAt: evaluation.downStartedAt,
			lastCheckedAt: checkedAt,
			updatedAt: checkedAt,
		});

		if (evaluation.shouldNotifyDown || evaluation.shouldNotifyUp) {
			const details: AlarmTriggerDetails = {
				url: uptimeData.url,
				status: evaluation.shouldNotifyDown ? "down" : "up",
				detectedAt: checkedAt.toISOString(),
				httpStatus:
					uptimeData.http_code > 0 ? uptimeData.http_code : undefined,
				responseTimeMs:
					uptimeData.total_ms > 0 ? uptimeData.total_ms : undefined,
				consecutiveFailures: evaluation.consecutiveFailures,
				downtimeDurationMs: evaluation.downtimeDurationMs ?? undefined,
				dashboardUrl,
			};

			const payload = evaluation.shouldNotifyDown
				? buildDownPayload({
					...details,
					detectedAt: formatTimestamp(checkedAt),
				})
				: buildUpPayload({
					...details,
					detectedAt: formatTimestamp(checkedAt),
				});

			await sendNotifications(alarm, payload, deps.senders);

			try {
				await deps.logHistory({
					id: createId("NANOID"),
					alarmId: alarm.id,
					websiteId,
					status: evaluation.shouldNotifyDown ? "down" : "up",
					details,
					triggeredAt: checkedAt,
				});
			} catch (error) {
				captureError(error, {
					type: "uptime_alarm_history_failed",
					alarmId: alarm.id,
				});
			}
		}
	}
}

export const alarmUtils = {
	evaluateAlarmState,
	buildDownPayload,
	buildUpPayload,
	formatDuration,
	buildDashboardUrl,
	sendNotifications,
};
