import { db, shutdownPostgres, sql } from "@databuddy/db";
import { clickHouse } from "@databuddy/db/clickhouse";
import { redis } from "@databuddy/redis";
import { buildHttpErrorResponse } from "@databuddy/shared/http-error-response";
import { databuddyEvlogRedaction } from "@databuddy/shared/evlog-redaction";
import { Elysia, redirect } from "elysia";
import { createError, initLogger, log } from "evlog";
import { evlog } from "evlog/elysia";
import { drain, enrich, flushDrain } from "./lib/logging";
import {
	checkLinkVisitQueueHealth,
	closeLinkVisitDelivery,
	startLinkVisitDeliveryWorker,
} from "./lib/link-visit-delivery";
import { calculateLinkReadiness } from "./lib/health";
import {
	disconnectProducer,
	getProducerHealthState,
	refreshProducerConnection,
	warmProducerConnection,
} from "./lib/producer";
import { redirectRoute } from "./routes/redirect";
import { preloadGeoDatabase } from "./utils/geo";

initLogger({
	env: { service: "links" },
	redact: databuddyEvlogRedaction,
	drain,
	sampling: {
		rates: { info: 20, warn: 50, debug: 5 },
		keep: [{ status: 400 }, { duration: 1500 }],
	},
});

const rootRedirectUrl =
	process.env.LINKS_ROOT_REDIRECT_URL || "https://databuddy.cc";
preloadGeoDatabase();
startLinkVisitDeliveryWorker();

async function warmProducerConnectionOnStartup() {
	try {
		await warmProducerConnection();
	} catch (error) {
		log.warn({
			error: error instanceof Error ? error.message : "Unknown error",
			message: "links.producer.warmup_failed",
		});
	}
}

warmProducerConnectionOnStartup();

const HEALTH_PROBE_TIMEOUT_MS = 1500;
const healthProbeFlights = new Map<string, Promise<unknown>>();

function getSharedHealthProbe<T>(
	name: string,
	signal: AbortSignal,
	probe: (signal: AbortSignal) => Promise<T>
): Promise<T> {
	const active = healthProbeFlights.get(name);
	if (active) {
		return active as Promise<T>;
	}

	const pending = Promise.resolve().then(() => probe(signal));
	healthProbeFlights.set(name, pending);
	const clear = () => {
		if (healthProbeFlights.get(name) === pending) {
			healthProbeFlights.delete(name);
		}
	};
	pending.then(clear, clear);
	return pending;
}
let shuttingDown = false;

const app = new Elysia()
	.use(evlog({ enrich }))
	.onBeforeHandle(({ request }) => {
		const pathname = new URL(request.url).pathname;
		if (!shuttingDown || pathname === "/health") {
			return;
		}
		if (pathname === "/health/status") {
			return Response.json(
				{ reason: "shutting_down", status: "unavailable" },
				{ status: 503 }
			);
		}
		throw createError({
			code: "links.SHUTTING_DOWN",
			message: "Links service is shutting down",
			status: 503,
			why: "The service is closing delivery workers and dependencies.",
			fix: "Retry the request shortly.",
		});
	})
	.get("/", () => redirect(rootRedirectUrl, 302))
	.get("/health", () => Response.json({ status: "ok" }))
	.onError(({ code, error }) => {
		const { payload, status } = buildHttpErrorResponse({ code, error });
		const event: Record<string, string | number> = {
			error_message: error instanceof Error ? error.message : String(error),
			error_step: "elysia",
			status,
		};
		if (code != null) {
			event.elysia_code = String(code);
		}
		if (status >= 500) {
			log.error(event);
		} else {
			log.warn(event);
		}
		return Response.json(payload, { status });
	})
	.get("/health/status", async () => {
		async function ping<T>(
			name: string,
			probe: (signal: AbortSignal) => Promise<T>
		) {
			const start = performance.now();
			const controller = new AbortController();
			let timeout: ReturnType<typeof setTimeout> | undefined;
			try {
				const value = await Promise.race([
					getSharedHealthProbe(name, controller.signal, probe),
					new Promise<never>((_resolve, reject) => {
						timeout = setTimeout(() => {
							const error = new Error(
								`Health probe exceeded ${HEALTH_PROBE_TIMEOUT_MS}ms`
							);
							controller.abort(error);
							reject(error);
						}, HEALTH_PROBE_TIMEOUT_MS);
						timeout.unref?.();
					}),
				]);
				return {
					status: "ok" as const,
					latency_ms: Math.round(performance.now() - start),
					...(value === undefined ? {} : { details: value }),
				};
			} catch {
				return {
					status: "error" as const,
					latency_ms: Math.round(performance.now() - start),
					code: "UNAVAILABLE",
				};
			} finally {
				if (timeout) {
					clearTimeout(timeout);
				}
			}
		}

		const redpandaProbe = ping("redpanda", () =>
			refreshProducerConnection()
		).then((probeResult) => {
			const state = getProducerHealthState();
			return {
				status:
					state === "connected"
						? ("ok" as const)
						: state === "cooldown"
							? ("error" as const)
							: state === "disabled"
								? ("disabled" as const)
								: ("pending" as const),
				latency_ms: probeResult.latency_ms,
				state,
			};
		});
		const [postgres, clickhouse, cache, deliveryQueue, redpanda] =
			await Promise.all([
				ping("postgres", async () => {
					await db
						.execute(sql`SELECT "deep_link_app" FROM "links" LIMIT 0`)
						.then(() => {});
				}),
				ping("clickhouse", async (signal) => {
					const { success } = await clickHouse.ping({
						abort_signal: signal,
						select: false,
					});
					if (!success) {
						throw new Error("ping failed");
					}
				}),
				ping("redis", () => redis.ping().then(() => {})),
				ping("link_visit_queue", () => checkLinkVisitQueueHealth()),
				redpandaProbe,
			]);

		const services = {
			postgres,
			clickhouse,
			redis: cache,
			link_visit_queue: deliveryQueue,
			redpanda,
		};
		const readiness = calculateLinkReadiness({
			clickhouse: clickhouse.status,
			deliveryQueue: deliveryQueue.status,
			postgres: postgres.status,
			redis: cache.status,
			redpanda: redpanda.status,
		});
		return Response.json(
			{
				status: readiness.status,
				services,
			},
			{ status: readiness.httpStatus }
		);
	})
	.use(redirectRoute);

const SHUTDOWN_TIMEOUT_MS = 20_000;

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	label = "Links operation"
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error(`${label} timed out`)),
					timeoutMs
				);
				timeout.unref?.();
			}),
		]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
}

interface CleanupFailure {
	errorMessage: string;
	step: string;
}

async function runCleanupStep(
	step: string,
	operation: () => Promise<void>,
	timeoutMs: number
): Promise<CleanupFailure | null> {
	try {
		await withTimeout(operation(), timeoutMs, step);
		return null;
	} catch (error) {
		return {
			errorMessage: error instanceof Error ? error.message : String(error),
			step,
		};
	}
}

async function shutdown(signal: string) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	log.info("lifecycle", `${signal} received, shutting down`);
	const { shutdownRedis } = await import("@databuddy/redis");
	const failures: CleanupFailure[] = [];
	try {
		await withTimeout(
			(async () => {
				// Stop admission/processing before disconnecting their dependencies.
				const queueFailure = await runCleanupStep(
					"linkVisitDeliveryClose",
					closeLinkVisitDelivery,
					6000
				);
				if (queueFailure) {
					failures.push(queueFailure);
				}

				const producerFailure = await runCleanupStep(
					"redpandaDisconnect",
					disconnectProducer,
					3000
				);
				if (producerFailure) {
					failures.push(producerFailure);
				}

				const dependencyFailures = await Promise.all([
					runCleanupStep("redisShutdown", shutdownRedis, 3000),
					runCleanupStep("postgresShutdown", shutdownPostgres, 3000),
				]);
				failures.push(
					...dependencyFailures.filter(
						(failure): failure is CleanupFailure => failure !== null
					)
				);

				const drainFailure = await runCleanupStep(
					"logDrainFlush",
					flushDrain,
					3000
				);
				if (drainFailure) {
					failures.push(drainFailure);
				}
			})(),
			SHUTDOWN_TIMEOUT_MS,
			"linksShutdown"
		);
	} catch (error) {
		failures.push({
			errorMessage: error instanceof Error ? error.message : String(error),
			step: "shutdownDeadline",
		});
	}
	if (failures.length > 0) {
		log.error({
			lifecycle: "shutdown",
			error_message: failures
				.map(({ errorMessage, step }) => `${step}: ${errorMessage}`)
				.join("; "),
			failed_steps: failures.map(({ step }) => step).join(","),
		});
		await withTimeout(flushDrain(), 1000, "finalFailureLogFlush").catch(
			() => undefined
		);
	}
	process.exit(failures.length > 0 ? 1 : 0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default { port: 2500, fetch: app.fetch };
