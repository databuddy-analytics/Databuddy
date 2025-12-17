import "./polyfills/compression";

import { Elysia } from "elysia";
import { disconnectProducer, getProducerStats } from "./lib/producer";
import {
	captureError,
	endRequestSpan,
	initTracing,
	shutdownTracing,
	startRequestSpan,
} from "./lib/tracing";
import basketRouter from "./routes/basket";
import emailRouter from "./routes/email";
import { closeGeoIPReader } from "./utils/ip-geo";

initTracing();

process.on("unhandledRejection", (reason, _promise) => {
	console.error("Unhandled Rejection:", reason);
	captureError(reason);
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught Exception:", error);
	captureError(error);
});

process.on("SIGTERM", async () => {
	console.log("SIGTERM received, shutting down gracefully...");
	await Promise.all([disconnectProducer(), shutdownTracing()]).catch((error) =>
		console.error("Shutdown error:", error)
	);
	closeGeoIPReader();
	process.exit(0);
});

process.on("SIGINT", async () => {
	console.log("SIGINT received, shutting down gracefully...");
	await Promise.all([disconnectProducer(), shutdownTracing()]).catch((error) =>
		console.error("Shutdown error:", error)
	);
	closeGeoIPReader();
	process.exit(0);
});

function getKafkaHealth() {
	const stats = getProducerStats();

	if (!stats.kafkaEnabled) {
		return {
			status: "disabled",
			enabled: false,
		};
	}

	if (stats.connected) {
		return {
			status: "healthy",
			enabled: true,
			connected: true,
		};
	}

	return {
		status: "unhealthy",
		enabled: true,
		connected: false,
		failed: stats.failed,
		lastErrorTime: stats.lastErrorTime,
	};
}

const app = new Elysia()
	.state("tracing", {
		span: null as ReturnType<typeof startRequestSpan> | null,
		startTime: 0,
	})
	.onBeforeHandle(function handleCors({ request, set }) {
		const origin = request.headers.get("origin");
		if (origin) {
			set.headers ??= {};
			set.headers["Access-Control-Allow-Origin"] = origin;
			set.headers["Access-Control-Allow-Methods"] =
				"POST, GET, OPTIONS, PUT, DELETE";
			set.headers["Access-Control-Allow-Headers"] =
				"Content-Type, Authorization, X-Requested-With, databuddy-client-id, databuddy-sdk-name, databuddy-sdk-version";
			set.headers["Access-Control-Allow-Credentials"] = "true";
		}
	})
	.onBeforeHandle(function startTrace({ request, path, store }) {
		if (request.method === "OPTIONS" || path === "/health") {
			return;
		}

		const method = request.method;
		const startTime = Date.now();
		const span = startRequestSpan(method, request.url, path);

		store.tracing = {
			span,
			startTime,
		};
	})
	.onAfterHandle(function endTrace({ responseValue, store }) {
		if (store.tracing?.span && store.tracing.startTime) {
			const statusCode =
				responseValue instanceof Response ? responseValue.status : 200;
			endRequestSpan(store.tracing.span, statusCode, store.tracing.startTime);
		}
	})
	.onError(function handleError({ error, code, store }) {
		if (store.tracing?.span && store.tracing.startTime) {
			const statusCode = code === "NOT_FOUND" ? 404 : 500;
			endRequestSpan(store.tracing.span, statusCode, store.tracing.startTime);
		}

		if (code === "NOT_FOUND") {
			return new Response(null, { status: 404 });
		}
		captureError(error);
	})
	.options("*", () => new Response(null, { status: 204 }))
	.use(basketRouter)
	.use(emailRouter)
	.get("/health", function healthCheck() {
		return {
			status: "ok",
			version: "1.0.0",
			producer_stats: getProducerStats(),
			kafka: getKafkaHealth(),
		};
	});

const port = process.env.PORT || 4000;

console.log(`Starting basket service on port ${port}`);

export default {
	fetch: app.fetch,
	port,
};
