import { and, db, eq } from "@databuddy/db";
import { alarms } from "@databuddy/db/schema";
import {
	buildAnomalyNotificationPayload,
	type NotificationChannel,
	NotificationClient,
} from "@databuddy/notifications";
import { z } from "zod";
import {
	type AnomalyDetectionConfig,
	detectAnomalies,
	fetchAnomalyTimeSeries,
} from "../lib/anomaly-detection";
import { protectedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const anomalySchema = z.object({
	metric: z.enum(["pageviews", "custom_events", "errors"]),
	type: z.enum(["spike", "drop"]),
	severity: z.enum(["warning", "critical"]),
	currentValue: z.number(),
	baselineMean: z.number(),
	baselineStdDev: z.number(),
	zScore: z.number(),
	percentChange: z.number(),
	detectedAt: z.string(),
	periodStart: z.string(),
	periodEnd: z.string(),
	eventName: z.string().optional(),
});

const timeSeriesPointSchema = z.object({
	hour: z.string(),
	count: z.number(),
});

export const anomaliesRouter = {
	detect: protectedProcedure
		.route({
			method: "POST",
			path: "/anomalies/detect",
			tags: ["Anomalies"],
			summary: "Detect anomalies",
			description:
				"Runs anomaly detection for a website across pageviews, errors, and custom events.",
		})
		.input(
			z.object({
				websiteId: z.string().min(1),
				config: z
					.object({
						warningThreshold: z.number().min(0.5).max(10).optional(),
						criticalThreshold: z.number().min(1).max(15).optional(),
						baselineDays: z.number().int().min(3).max(30).optional(),
						minimumBaselineCount: z.number().int().min(1).optional(),
						percentChangeFallback: z.number().min(50).max(1000).optional(),
					})
					.optional(),
			})
		)
		.output(z.array(anomalySchema))
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			const clientId = workspace.website.id;
			const config: Partial<AnomalyDetectionConfig> = {};

			if (input.config?.warningThreshold !== undefined) {
				config.warningThreshold = input.config.warningThreshold;
			}
			if (input.config?.criticalThreshold !== undefined) {
				config.criticalThreshold = input.config.criticalThreshold;
			}
			if (input.config?.baselineDays !== undefined) {
				config.baselineDays = input.config.baselineDays;
			}
			if (input.config?.minimumBaselineCount !== undefined) {
				config.minimumBaselineCount = input.config.minimumBaselineCount;
			}
			if (input.config?.percentChangeFallback !== undefined) {
				config.percentChangeFallback = input.config.percentChangeFallback;
			}

			return detectAnomalies(clientId, config);
		}),

	timeSeries: protectedProcedure
		.route({
			method: "POST",
			path: "/anomalies/time-series",
			tags: ["Anomalies"],
			summary: "Anomaly time series",
			description:
				"Returns hourly event counts for a metric over the past N days for charting.",
		})
		.input(
			z.object({
				websiteId: z.string().min(1),
				metric: z.enum(["pageviews", "custom_events", "errors"]),
				days: z.number().int().min(1).max(30).default(7),
			})
		)
		.output(z.array(timeSeriesPointSchema))
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			return fetchAnomalyTimeSeries(
				workspace.website.id,
				input.metric,
				input.days
			);
		}),

	notify: protectedProcedure
		.route({
			method: "POST",
			path: "/anomalies/notify",
			tags: ["Anomalies"],
			summary: "Send anomaly notifications",
			description:
				"Runs detection and sends notifications to all matching alarm destinations for traffic_spike/error_rate triggers.",
		})
		.input(
			z.object({
				websiteId: z.string().min(1),
			})
		)
		.output(
			z.object({
				anomaliesFound: z.number(),
				notificationsSent: z.number(),
			})
		)
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			const clientId = workspace.website.id;
			const orgId = workspace.organizationId;

			const detected = await detectAnomalies(clientId);

			if (detected.length === 0) {
				return { anomaliesFound: 0, notificationsSent: 0 };
			}

			const matchingAlarms = await db.query.alarms.findMany({
				where: and(eq(alarms.organizationId, orgId), eq(alarms.enabled, true)),
				with: { destinations: true },
			});

			const relevantAlarms = matchingAlarms.filter((alarm) => {
				if (alarm.triggerType === "traffic_spike") {
					return detected.some(
						(a) => a.metric === "pageviews" || a.metric === "custom_events"
					);
				}
				if (alarm.triggerType === "error_rate") {
					return detected.some((a) => a.metric === "errors");
				}
				return false;
			});

			let notificationsSent = 0;

			const siteLabel =
				workspace.website.name || workspace.website.domain || clientId;

			for (const alarm of relevantAlarms) {
				if (!alarm.destinations || alarm.destinations.length === 0) {
					continue;
				}

				const relevantAnomalies = detected.filter((a) => {
					if (alarm.triggerType === "traffic_spike") {
						return a.metric === "pageviews" || a.metric === "custom_events";
					}
					if (alarm.triggerType === "error_rate") {
						return a.metric === "errors";
					}
					return false;
				});

				for (const anomaly of relevantAnomalies) {
					const payload = buildAnomalyNotificationPayload({
						kind: anomaly.type,
						metric: anomaly.metric,
						siteLabel,
						currentValue: anomaly.currentValue,
						baselineValue: anomaly.baselineMean,
						percentChange: anomaly.percentChange,
						zScore: anomaly.zScore,
						severity: anomaly.severity,
						periodStart: anomaly.periodStart,
						periodEnd: anomaly.periodEnd,
						eventName: anomaly.eventName,
					});

					const clientConfig = buildClientConfig(alarm.destinations);
					const channels = getChannels(alarm.destinations);

					if (channels.length === 0) {
						continue;
					}

					const client = new NotificationClient(clientConfig);
					const results = await client.send(payload, { channels });
					notificationsSent += results.filter((r) => r.success).length;
				}
			}

			return {
				anomaliesFound: detected.length,
				notificationsSent,
			};
		}),
};

interface AlarmDest {
	config: unknown;
	identifier: string;
	type: string;
}

function buildClientConfig(
	destinations: AlarmDest[]
): Record<string, Record<string, unknown>> {
	const config: Record<string, Record<string, unknown>> = {};

	for (const dest of destinations) {
		const cfg = (dest.config ?? {}) as Record<string, unknown>;

		if (dest.type === "slack") {
			config.slack = { webhookUrl: dest.identifier };
		} else if (dest.type === "discord") {
			config.discord = { webhookUrl: dest.identifier };
		} else if (dest.type === "teams") {
			config.teams = { webhookUrl: dest.identifier };
		} else if (dest.type === "google_chat") {
			config.googleChat = { webhookUrl: dest.identifier };
		} else if (dest.type === "telegram") {
			config.telegram = {
				botToken: cfg.botToken as string,
				chatId: dest.identifier || (cfg.chatId as string),
			};
		} else if (dest.type === "webhook") {
			config.webhook = {
				url: dest.identifier,
				headers: cfg.headers as Record<string, string> | undefined,
			};
		}
	}

	return config;
}

function getChannels(destinations: AlarmDest[]): NotificationChannel[] {
	const channels: NotificationChannel[] = [];
	for (const dest of destinations) {
		if (dest.type === "slack") {
			channels.push("slack");
		} else if (dest.type === "discord") {
			channels.push("discord");
		} else if (dest.type === "teams") {
			channels.push("teams");
		} else if (dest.type === "google_chat") {
			channels.push("google-chat");
		} else if (dest.type === "telegram") {
			channels.push("telegram");
		} else if (dest.type === "webhook") {
			channels.push("webhook");
		}
	}
	return channels;
}
