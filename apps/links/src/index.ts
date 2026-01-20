import { opentelemetry } from "@elysiajs/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { Elysia } from "elysia";
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

const app = new Elysia()
	.use(
		opentelemetry({
			spanProcessor: batchSpanProcessor,
			serviceName: "links",
		})
	)
	.get("/", function healthCheck() {
		return { status: "ok" };
	})
	.get("/health", function healthCheck() {
		return { status: "ok" };
	})
	.use(expiredRoute)
	.use(redirectRoute);

async function gracefulShutdown(signal: string) {
	console.log(`${signal} received, shutting down gracefully...`);
	await Promise.all([disconnectProducer(), shutdownTracing()]);
	process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default {
	port: 2500,
	fetch: app.fetch,
};
