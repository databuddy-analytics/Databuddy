import { ratelimit } from "@databuddy/redis/rate-limit";
import { z } from "zod";
import { rpcError } from "../errors";
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
};
