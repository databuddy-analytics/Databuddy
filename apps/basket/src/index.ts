// import './polyfills/compression'

import { Elysia } from "elysia";
import { logger } from "./lib/logger";
// import stripeRouter from './routes/stripe';
import { getProducerStats } from "./lib/producer";
import basketRouter from "./routes/basket";
import emailRouter from "./routes/email";
import "./polyfills/compression";

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
// import { checkBotId } from "botid/server";

const app = new Elysia()
	.onError(({ error }) => {
		logger.error(
			new Error(
				`${error instanceof Error ? error.name : "Unknown"}: ${error instanceof Error ? error.message : "Unknown"}`
			)
		);
	})
	.onBeforeHandle(({ request, set }) => {
		// const { isBot } = await checkBotId();
		// if (isBot) {
		//   return new Response(null, { status: 403 });
		// }
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
	.options("*", () => new Response(null, { status: 204 }))
	.use(basketRouter)
	// .use(stripeRouter)
	.use(emailRouter)
	.get("/health", () => ({
		status: "ok",
		version: "1.0.0",
		producer_stats: getProducerStats(),
		kafka: getKafkaHealth(),
	}));

const port = process.env.PORT || 4000;

console.log(`Starting basket service on port ${port}`);
console.log(`Basket service running on http://localhost:${port}`);

export default {
	fetch: app.fetch,
	port: Number.parseInt(port.toString()),
};
