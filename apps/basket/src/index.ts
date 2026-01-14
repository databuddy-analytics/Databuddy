import "./polyfills/compression";

import { disconnectProducer, getProducerStats } from "@lib/producer";
import {
	captureError,
	endRequestSpan,
	initTracing,
	setCurrentRequestSpan,
	shutdownTracing,
	startRequestSpan,
} from "@lib/tracing";
import type { context } from "@opentelemetry/api";
import basketRouter from "@routes/basket";
import emailRouter from "@routes/email";
import llmRouter from "@routes/llm";
import { closeGeoIPReader } from "@utils/ip-geo";
import { Elysia } from "elysia";

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
		span: null as ReturnType<typeof startRequestSpan>["span"] | null,
		activeContext: null as ReturnType<typeof context.active> | null | undefined,
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
		const { span, activeContext } = startRequestSpan(method, request.url, path);

		// Set the span as active for this request (fallback for context propagation)
		setCurrentRequestSpan(span);

		store.tracing = {
			span,
			activeContext,
			startTime,
		};
	})
	.onAfterHandle(function endTrace({ responseValue, store }) {
		if (store.tracing?.span && store.tracing.startTime) {
			const statusCode =
				responseValue instanceof Response ? responseValue.status : 200;
			endRequestSpan(store.tracing.span, statusCode, store.tracing.startTime);
		}
		// Clear the current request span
		setCurrentRequestSpan(null);
	})
	.onError(function handleError({ error, code, store }) {
		if (store.tracing?.span && store.tracing.startTime) {
			const statusCode = code === "NOT_FOUND" ? 404 : 500;
			endRequestSpan(store.tracing.span, statusCode, store.tracing.startTime);
		}

		if (code === "NOT_FOUND") {
			setCurrentRequestSpan(null);
			return new Response(null, { status: 404 });
		}
		captureError(error);
		setCurrentRequestSpan(null);
	})
	.options("*", () => new Response(null, { status: 204 }))
	.use(basketRouter)
	.use(emailRouter)
	.use(llmRouter)
	.get("/health", function healthCheck() {
		return new Response(
			JSON.stringify({
				status: "ok",
				version: "1.0.0",
				producer_stats: getProducerStats(),
				kafka: getKafkaHealth(),
			}),
			{ status: 200 }
		);
	});

const port = process.env.PORT || 4000;

export default {
	fetch: app.fetch,
	port,
};
