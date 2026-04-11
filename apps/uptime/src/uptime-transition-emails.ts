import { and, db, eq } from "@databuddy/db";
import { alarms, member, user } from "@databuddy/db/schema";
import { chQuery } from "@databuddy/db/clickhouse";
import { UptimeAlertEmail } from "@databuddy/email";
import {
	type NotificationChannel,
	NotificationClient,
} from "@databuddy/notifications";
import { buildUptimeNotificationPayload } from "@databuddy/notifications/templates/uptime";
import { Resend } from "resend";
import type { ScheduleData } from "./actions";
import { captureError } from "./lib/tracing";
import { MonitorStatus, type UptimeData } from "./types";

const TRAILING_SLASH = /\/$/;

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

function resolveTransitionKind(
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

async function getVerifiedOrgMemberEmails(
	organizationId: string
): Promise<string[]> {
	const rows = await db
		.select({ email: user.email })
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(user.emailVerified, true)
			)
		);
	const set = new Set<string>();
	for (const r of rows) {
		if (r.email.includes("@")) {
			set.add(r.email);
		}
	}
	return [...set];
}

export async function getPreviousMonitorStatus(
	siteId: string
): Promise<number | undefined> {
	if (!process.env.CLICKHOUSE_URL) {
		return undefined;
	}
	try {
		const rows = await chQuery<{ status: number }>(
			`SELECT status
       FROM uptime.uptime_monitor
       WHERE site_id = {siteId:String}
       ORDER BY timestamp DESC
       LIMIT 1`,
			{ siteId }
		);
		const row = rows[0];
		if (row === undefined) {
			return undefined;
		}
		return row.status;
	} catch (error) {
		captureError(error, { error_step: "clickhouse_previous_status" });
		return undefined;
	}
}

export async function sendUptimeTransitionEmailsIfNeeded(options: {
	schedule: ScheduleData;
	data: UptimeData;
	previousStatus: number | undefined;
}): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		return;
	}

	const kind = resolveTransitionKind(
		options.previousStatus,
		options.data.status
	);
	if (kind === null) {
		return;
	}

	const emails = await getVerifiedOrgMemberEmails(
		options.schedule.organizationId
	);
	if (emails.length === 0) {
		return;
	}

	const siteLabel = buildSiteLabel(options.schedule);
	const baseUrl = process.env.DASHBOARD_APP_URL ?? "https://app.databuddy.cc";
	const dashboardUrl = `${baseUrl.replace(TRAILING_SLASH, "")}/monitors/${options.schedule.id}`;

	const resend = new Resend(apiKey);
	const sslExpiry =
		options.data.ssl_expiry > 0 ? options.data.ssl_expiry : undefined;

	try {
		const result = await resend.emails.send({
			from: "Databuddy <alerts@databuddy.cc>",
			to: emails,
			subject:
				kind === "down"
					? `[Databuddy] ${siteLabel} is down`
					: `[Databuddy] ${siteLabel} is back up`,
			react: UptimeAlertEmail({
				kind,
				siteLabel,
				url: options.data.url,
				checkedAt: options.data.timestamp,
				httpCode: options.data.http_code,
				error: options.data.error ?? "",
				probeRegion: options.data.probe_region,
				totalMs: options.data.total_ms,
				ttfbMs: options.data.ttfb_ms,
				sslValid: options.data.ssl_valid === 1,
				sslExpiryMs: sslExpiry,
				dashboardUrl,
			}),
		});
		if (result.error) {
			captureError(new Error(result.error.message), {
				error_step: "transition_email_resend",
			});
		}
	} catch (error) {
		captureError(error, { error_step: "transition_email" });
	}
}

export async function sendUptimeAlarmNotificationsIfNeeded(options: {
	schedule: ScheduleData;
	data: UptimeData;
	previousStatus: number | undefined;
}): Promise<void> {
	const kind = resolveTransitionKind(
		options.previousStatus,
		options.data.status
	);
	if (kind === null) {
		return;
	}

	if (!options.schedule.websiteId) {
		return;
	}

	const matchingAlarms = await db.query.alarms.findMany({
		where: and(
			eq(alarms.websiteId, options.schedule.websiteId),
			eq(alarms.enabled, true),
			eq(alarms.triggerType, "uptime")
		),
		with: { destinations: true },
	});

	if (matchingAlarms.length === 0) {
		return;
	}

	const siteLabel = buildSiteLabel(options.schedule);
	const sslExpiry =
		options.data.ssl_expiry > 0 ? options.data.ssl_expiry : undefined;

	const payload = buildUptimeNotificationPayload({
		kind,
		siteLabel,
		url: options.data.url,
		checkedAt: options.data.timestamp,
		httpCode: options.data.http_code,
		error: options.data.error ?? "",
		probeRegion: options.data.probe_region,
		totalMs: options.data.total_ms,
		ttfbMs: options.data.ttfb_ms,
		sslValid: options.data.ssl_valid === 1,
		sslExpiryMs: sslExpiry,
	});

	const dispatchPromises = matchingAlarms
		.filter((alarm) => alarm.destinations && alarm.destinations.length > 0)
		.map(async (alarm) => {
			const clientConfig: Record<string, Record<string, unknown>> = {};
			const channels: NotificationChannel[] = [];

			for (const dest of alarm.destinations) {
				const cfg = (dest.config ?? {}) as Record<string, unknown>;

				if (dest.type === "slack") {
					clientConfig.slack = { webhookUrl: dest.identifier };
					channels.push("slack");
				} else if (dest.type === "discord") {
					clientConfig.discord = { webhookUrl: dest.identifier };
					channels.push("discord");
				} else if (dest.type === "teams") {
					clientConfig.teams = { webhookUrl: dest.identifier };
					channels.push("teams");
				} else if (dest.type === "google_chat") {
					clientConfig.googleChat = { webhookUrl: dest.identifier };
					channels.push("google-chat");
				} else if (dest.type === "telegram") {
					const botToken = typeof cfg.botToken === "string" ? cfg.botToken : "";
					const chatId = dest.identifier || (typeof cfg.chatId === "string" ? cfg.chatId : "");
					if (!botToken || !chatId) {
						return;
					}
					clientConfig.telegram = { botToken, chatId };
					channels.push("telegram");
				} else if (dest.type === "webhook") {
					const headers = cfg.headers && typeof cfg.headers === "object"
						? cfg.headers as Record<string, string>
						: undefined;
					clientConfig.webhook = {
						url: dest.identifier,
						headers,
					};
					channels.push("webhook");
				}
			}

			if (channels.length === 0) {
				return;
			}

			try {
				const client = new NotificationClient(clientConfig);
				await client.send(payload, { channels });
			} catch (error) {
				captureError(error, {
					error_step: "uptime_alarm_notification",
					alarm_id: alarm.id,
				});
			}
		});

	await Promise.allSettled(dispatchPromises);
}
