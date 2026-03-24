import { Receiver } from "@upstash/qstash";
import { Elysia } from "elysia";
import { initLogger, log } from "evlog";
import { evlog } from "evlog/elysia";
import { z } from "zod";
import { type CheckOptions, checkUptime, lookupSchedule } from "./actions";
import { isHealthExtractionEnabled } from "./json-parser";
import {
	enrichUptimeWideEvent,
	flushBatchedUptimeDrain,
	uptimeLoggerDrain,
} from "./lib/evlog-uptime";
import { sendUptimeEvent } from "./lib/producer";
import { captureError, mergeWideEvent } from "./lib/tracing";
import {
	getPreviousMonitorStatus,
	sendUptimeTransitionEmailsIfNeeded,
} from "./uptime-transition-emails";

initLogger({
	env: { service: "uptime" },
	drain: uptimeLoggerDrain,
	sampling: {
		// rates: { info: 20, warn: 50, debug: 5 },
		// keep: [{ status: 400 }, { duration: 1500 }],
	},
});

process.on("unhandledRejection", (reason, _promise) => {
	captureError(reason, { process: "unhandledRejection" });
	log.error({
		process: "unhandledRejection",
		reason: reason instanceof Error ? reason.message : String(reason),
	});
});

process.on("uncaughtException", (error) => {
	captureError(error, { process: "uncaughtException" });
	log.error({
		process: "uncaughtException",
		error: error instanceof Error ? error.message : String(error),
	});
});

process.on("SIGTERM", async () => {
	log.info("lifecycle", "SIGTERM received, shutting down gracefully");
	await flushBatchedUptimeDrain().catch((error) =>
		log.error({
			lifecycle: "drainFlush",
			error: error instanceof Error ? error.message : String(error),
		})
	);
	process.exit(0);
});

process.on("SIGINT", async () => {
	log.info("lifecycle", "SIGINT received, shutting down gracefully");
	await flushBatchedUptimeDrain().catch((error) =>
		log.error({
			lifecycle: "drainFlush",
			error: error instanceof Error ? error.message : String(error),
		})
	);
	process.exit(0);
});

const CURRENT_SIGNING_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY;
const NEXT_SIGNING_KEY = process.env.QSTASH_NEXT_SIGNING_KEY;

if (!(CURRENT_SIGNING_KEY && NEXT_SIGNING_KEY)) {
	throw new Error(
		"QSTASH_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY environment variables are required"
	);
}

const receiver = new Receiver({
	currentSigningKey: CURRENT_SIGNING_KEY,
	nextSigningKey: NEXT_SIGNING_KEY,
});

const app = new Elysia()
	.use(
		evlog({
			enrich: enrichUptimeWideEvent,
		})
	)
	.onError(function handleError({ error, code }) {
		captureError(error, {
			error_step: "elysia",
			elysia_code: String(code),
		});
	})
	.get("/health/status", async () => {
		const { db, sql } = await import("@databuddy/db");
		const { Kafka } = await import("kafkajs");

		async function ping(probe: () => Promise<void>) {
			const start = performance.now();
			try {
				await probe();
				return {
					status: "ok" as const,
					latency_ms: Math.round(performance.now() - start),
				};
			} catch (err) {
				return {
					status: "error" as const,
					latency_ms: Math.round(performance.now() - start),
					error: err instanceof Error ? err.message : "unknown",
				};
			}
		}

		const [postgres, redpanda] = await Promise.all([
			ping(() => db.execute(sql`SELECT 1`).then(() => {})),
			ping(async () => {
				const broker = process.env.REDPANDA_BROKER;
				if (!broker) {
					throw new Error("not configured");
				}
				const kafka = new Kafka({
					clientId: "health",
					brokers: [broker],
					connectionTimeout: 5000,
					...(process.env.REDPANDA_USER &&
						process.env.REDPANDA_PASSWORD && {
							sasl: {
								mechanism: "scram-sha-256",
								username: process.env.REDPANDA_USER,
								password: process.env.REDPANDA_PASSWORD,
							},
							ssl: false,
						}),
				});
				const admin = kafka.admin();
				try {
					await admin.connect();
				} finally {
					await admin.disconnect().catch(() => {});
				}
			}),
		]);

		const services = { postgres, redpanda };
		const status = Object.values(services).every((s) => s.status === "ok")
			? "ok"
			: "degraded";
		return Response.json(
			{ status, services },
			{ status: status === "ok" ? 200 : 503 }
		);
	})
	.get("/health", () => ({ status: "ok" }))
	.post("/", async ({ headers, body }) => {
		try {
			const headerSchema = z.object({
				"upstash-signature": z.string(),
				"x-schedule-id": z.string(),
				"upstash-retried": z.string().optional(),
			});

			const parsed = headerSchema.safeParse(headers);
			if (!parsed.success) {
				const errorDetails = parsed.error.format();
				captureError(new Error("Missing required headers"), {
					error_step: "validation_headers",
					schedule_id: String(headers["x-schedule-id"] ?? ""),
				});
				return new Response(
					JSON.stringify({
						error: "Missing required headers",
						details: errorDetails,
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					}
				);
			}

			const { "upstash-signature": signature, "x-schedule-id": scheduleId } =
				parsed.data;

			const isValid = await receiver.verify({
				// @ts-expect-error, this doesn't require type assertions
				body,
				signature,
				url: process.env.UPTIME_URL,
			});

			if (!isValid) {
				captureError(new Error("Invalid QStash signature"), {
					error_step: "qstash_signature",
					schedule_id: scheduleId,
				});
				return new Response("Invalid signature", { status: 401 });
			}

			const schedule = await lookupSchedule(scheduleId);
			if (!schedule.success) {
				captureError(new Error(schedule.error), {
					error_step: "schedule_not_found",
					schedule_id: scheduleId,
				});
				return new Response(
					JSON.stringify({
						error: "Schedule not found",
						scheduleId,
						details: schedule.error,
					}),
					{
						status: 404,
						headers: { "Content-Type": "application/json" },
					}
				);
			}

			const monitorId = schedule.data.websiteId || scheduleId;

			mergeWideEvent({
				schedule_id: scheduleId,
				monitor_id: monitorId,
				organization_id: schedule.data.organizationId,
				...(schedule.data.websiteId
					? { website_id: schedule.data.websiteId }
					: {}),
			});

			const maxRetries = parsed.data["upstash-retried"]
				? Number.parseInt(parsed.data["upstash-retried"], 10) + 3
				: 3;

			const options: CheckOptions = {
				timeout: schedule.data.timeout ?? undefined,
				cacheBust: schedule.data.cacheBust,
				extractHealth: isHealthExtractionEnabled(
					schedule.data.jsonParsingConfig
				),
			};

			const result = await checkUptime(
				monitorId,
				schedule.data.url,
				1,
				maxRetries,
				options
			);

			if (!result.success) {
				captureError(new Error(result.error), {
					error_step: "uptime_check_failed",
					monitor_id: monitorId,
					check_url: schedule.data.url,
				});
				return new Response("Failed to check uptime", { status: 500 });
			}

			const previousStatus = await getPreviousMonitorStatus(monitorId);

			mergeWideEvent({
				previous_uptime_status:
					previousStatus === undefined ? -1 : previousStatus,
			});

			try {
				await sendUptimeEvent(result.data, monitorId);
				await sendUptimeTransitionEmailsIfNeeded({
					schedule: schedule.data,
					data: result.data,
					previousStatus,
				});
			} catch (error) {
				captureError(error, {
					error_step: "producer_pipeline",
					monitor_id: monitorId,
					http_code: result.data.http_code,
				});
			}

			return new Response("Uptime check complete", { status: 200 });
		} catch (error) {
			captureError(error, { error_step: "handler" });
			return new Response("Internal server error", { status: 500 });
		}
	});

export default {
	port: 4000,
	fetch: app.fetch,
};
