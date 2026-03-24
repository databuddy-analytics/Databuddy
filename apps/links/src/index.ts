import { opentelemetry } from "@elysiajs/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { Elysia, redirect } from "elysia";
import { initLogger, log } from "evlog";
import { evlog } from "evlog/elysia";
import { disconnectProducer } from "./lib/producer";
import { shutdownTracing } from "./lib/tracing";
import { expiredRoute } from "./routes/expired";
import { redirectRoute } from "./routes/redirect";

const exporter = new OTLPTraceExporter({
	url: "https://api.axiom.co/v1/traces",
	headers: {
		Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
		"X-Axiom-Dataset": process.env.AXIOM_DATASET ?? "links",
	},
});

const batchSpanProcessor = new BatchSpanProcessor(exporter, {
	scheduledDelayMillis: 1000,
	exportTimeoutMillis: 30_000,
	maxExportBatchSize: 512,
	maxQueueSize: 2048,
});

initLogger({
	env: { service: "links" },
});

const app = new Elysia()
	.use(evlog())
	.use(
		opentelemetry({
			spanProcessor: batchSpanProcessor,
			serviceName: "links",
		})
	)
	.get("/", function rootRedirect() {
		return redirect("https://databuddy.cc", 302);
	})
	.get("/health/status", async function linksHealthStatus() {
		const { db, sql } = await import("@databuddy/db");
		const { redis } = await import("@databuddy/redis");

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

		const [postgres, cache] = await Promise.all([
			ping(() => db.execute(sql`SELECT 1`).then(() => {})),
			ping(() => redis.ping().then(() => {})),
		]);

		const services = { postgres, redis: cache };
		const status = Object.values(services).every((s) => s.status === "ok")
			? "ok"
			: "degraded";
		return Response.json(
			{ status, services },
			{ status: status === "ok" ? 200 : 503 }
		);
	})
	.get("/health", () => Response.json({ status: "ok" }, { status: 200 }))
	.use(expiredRoute)
	.use(redirectRoute);

async function gracefulShutdown(signal: string) {
	log.info("lifecycle", `${signal} received, shutting down gracefully`);
	await Promise.all([disconnectProducer(), shutdownTracing()]);
	process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default {
	port: 2500,
	fetch: app.fetch,
};
