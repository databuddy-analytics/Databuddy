import {
	db,
	normalizeEmailNotificationSettings,
	type OrganizationEmailNotificationSettings,
} from "@databuddy/db";
import {
	buildAnomalyNotificationPayload,
	NotificationClient,
} from "@databuddy/notifications";
import { redis } from "@databuddy/redis";
import { ratelimit } from "@databuddy/redis/rate-limit";
import { z } from "zod";
import { rpcError } from "../errors";
import { toNotificationTargets } from "../lib/alarm-notifications";
import {
	detectAnomalies,
	fetchAnomalyTimeSeries,
} from "../lib/anomaly-detection";
import { type Context, protectedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

async function throttleAnomalyAction(
	context: Context,
	action: string,
	websiteId: string,
	max: number
): Promise<void> {
	const principal = context.user
		? `user:${context.user.id}`
		: context.apiKey
			? `apikey:${context.apiKey.id}`
			: null;
	if (!principal) {
		return;
	}
	const rl = await ratelimit(
		`anomalies:${action}:${principal}:${websiteId}`,
		max,
		60
	);
	if (!rl.success) {
		throw rpcError.rateLimited(rl.reset);
	}
}

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

function anomalyEmailEnabled(
	metric: string,
	organizationSettings: OrganizationEmailNotificationSettings | null | undefined
): boolean {
	const settings = normalizeEmailNotificationSettings(organizationSettings);
	if (metric === "errors") {
		return settings.anomalies.errorEmails;
	}
	if (metric === "custom_events") {
		return settings.anomalies.customEventEmails;
	}
	return settings.anomalies.trafficEmails;
}

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
			await throttleAnomalyAction(context, "detect", workspace.website.id, 12);

			return detectAnomalies(workspace.website.id, input.config ?? {});
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
			await throttleAnomalyAction(
				context,
				"timeSeries",
				workspace.website.id,
				30
			);

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
				permissions: ["update"],
			});
			await throttleAnomalyAction(context, "notify", workspace.website.id, 3);

			const clientId = workspace.website.id;
			const orgId = workspace.organizationId;

			const org = await db.query.organization.findFirst({
				where: { id: orgId },
				columns: { emailNotifications: true },
			});

			const detected = await detectAnomalies(clientId);

			if (detected.length === 0) {
				return { anomaliesFound: 0, notificationsSent: 0 };
			}

			const matchingAlarms = await db.query.alarms.findMany({
				where: { organizationId: orgId, enabled: true },
				with: { destinations: true },
			});

			const relevantAlarms = matchingAlarms.filter((alarm) =>
				detected.some((a) => matchesTrigger(alarm.triggerType, a.metric))
			);

			let notificationsSent = 0;

			const siteLabel =
				workspace.website.name || workspace.website.domain || clientId;

			for (const alarm of relevantAlarms) {
				if (!alarm.destinations || alarm.destinations.length === 0) {
					continue;
				}

				const relevantAnomalies = detected.filter((a) =>
					matchesTrigger(alarm.triggerType, a.metric)
				);

				for (const anomaly of relevantAnomalies) {
					const dedupKey = `anomalies:notified:${alarm.id}:${anomaly.metric}:${anomaly.type}:${anomaly.eventName ?? ""}`;
					const reserved = await redis.set(dedupKey, "1", "EX", 300, "NX");
					if (reserved !== "OK") {
						continue;
					}

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

					const emailEnabled = anomalyEmailEnabled(
						anomaly.metric,
						org?.emailNotifications
					);
					const destinations = emailEnabled
						? alarm.destinations
						: alarm.destinations.filter((dest) => dest.type !== "email");
					const targets = toNotificationTargets(destinations);
					if (targets.length === 0) {
						continue;
					}

					const results = (
						await Promise.all(
							targets.map((target) =>
								new NotificationClient(target.clientConfig).send(payload, {
									channels: [target.channel],
								})
							)
						)
					).flat();
					notificationsSent += results.filter((r) => r.success).length;
				}
			}

			return {
				anomaliesFound: detected.length,
				notificationsSent,
			};
		}),
};

function matchesTrigger(triggerType: string, metric: string): boolean {
	if (triggerType === "traffic_spike") {
		return metric === "pageviews" || metric === "custom_events";
	}
	return triggerType === "error_rate" && metric === "errors";
}
