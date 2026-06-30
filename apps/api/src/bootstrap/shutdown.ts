import { shutdownPostgres, warmPool } from "@databuddy/db";
import { log } from "evlog";
import { flushBatchedApiDrain } from "@/lib/evlog-api";
import { shutdownTccTracing } from "@/lib/tcc-otel";

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

export function warmPostgresPool() {
	warmPool().catch((error) =>
		log.error({
			lifecycle: "poolWarm",
			error_message: error instanceof Error ? error.message : String(error),
		})
	);
}

export function registerShutdownHooks() {
	process.on("SIGINT", () => shutdownApi("SIGINT"));
	process.on("SIGTERM", () => shutdownApi("SIGTERM"));
}

async function shutdownApi(signal: string) {
	if (shuttingDown) {
		log.info({
			lifecycle: "shutdown",
			signal,
			message: "Shutdown already in progress",
		});
		return;
	}

	shuttingDown = true;
	const timeout = setTimeout(() => {
		log.error({
			lifecycle: "shutdown",
			signal,
			message: "Graceful shutdown timed out",
		});
		process.exit(1);
	}, SHUTDOWN_TIMEOUT_MS);
	timeout.unref?.();

	let exitCode = 0;
	try {
		log.info("lifecycle", `${signal} received, shutting down gracefully`);
		const { shutdownRedis } = await import("@databuddy/redis");
		await Promise.all([
			shutdownRedis().catch((error) =>
				log.error({
					lifecycle: "redisShutdown",
					error_message: error instanceof Error ? error.message : String(error),
				})
			),
			shutdownPostgres().catch((error) =>
				log.error({
					lifecycle: "postgresShutdown",
					error_message: error instanceof Error ? error.message : String(error),
				})
			),
			flushBatchedApiDrain().catch((error) =>
				log.error({
					lifecycle: "drainFlush",
					error_message: error instanceof Error ? error.message : String(error),
				})
			),
			shutdownTccTracing().catch((error) =>
				log.error({
					lifecycle: "tccOtelShutdown",
					error_message: error instanceof Error ? error.message : String(error),
				})
			),
		]);
	} catch (error) {
		exitCode = 1;
		log.error({
			lifecycle: "shutdown",
			signal,
			error_message: error instanceof Error ? error.message : String(error),
			error_stack: error instanceof Error ? error.stack : undefined,
		});
	} finally {
		clearTimeout(timeout);
		process.exit(exitCode);
	}
}
