import { setAiRequestLoggerProvider } from "@databuddy/ai/lib/request-logger";
import { db, shutdownPostgres, sql } from "@databuddy/db";
import { setRpcRequestLoggerProvider } from "@databuddy/rpc/log-context";
import {
	createDatabuddyEvlogEnv,
	databuddyEvlogRedaction,
} from "@databuddy/shared/evlog-redaction";
import { serve } from "bun";
import { App } from "@slack/bolt";
import { initLogger, log } from "evlog";
import { DatabuddyAgentClient } from "@/agent/agent-client";
import { resolveSlackConfig } from "@/config";
import {
	captureSlackError,
	flushBatchedSlackDrain,
	getActiveSlackLog,
	slackLoggerDrain,
} from "@/lib/evlog-slack";
import {
	abortAllSlackActiveRuns,
	waitForSlackActiveRuns,
} from "@/slack/active-runs";
import {
	createSlackAuthorize,
	SlackInstallationStore,
} from "@/slack/installations";
import { registerSlackListeners } from "@/slack/listeners";

const SHUTDOWN_RUN_SETTLE_TIMEOUT_MS = 10_000;

initLogger({
	env: createDatabuddyEvlogEnv("slack"),
	redact: databuddyEvlogRedaction,
	drain: slackLoggerDrain,
	sampling: {},
});

setAiRequestLoggerProvider(getActiveSlackLog);
setRpcRequestLoggerProvider(getActiveSlackLog);

process.on("unhandledRejection", (reason) => {
	captureSlackError(reason, { process: "unhandledRejection" });
});

process.on("uncaughtException", (error) => {
	captureSlackError(error, { process: "uncaughtException" });
});

async function healthPing(probe: () => Promise<unknown>): Promise<boolean> {
	try {
		await probe();
		return true;
	} catch {
		return false;
	}
}

function startHealthServer(port: number): void {
	serve({
		port,
		fetch: async (request) => {
			const { pathname } = new URL(request.url);
			if (pathname === "/health") {
				return Response.json({ status: "ok" });
			}
			if (pathname !== "/health/status") {
				return new Response("not found", { status: 404 });
			}
			const [postgres, cache] = await Promise.all([
				healthPing(() => db.execute(sql`SELECT 1`)),
				healthPing(async () => {
					const { redis } = await import("@databuddy/redis");
					await redis.ping();
				}),
			]);
			const allOk = postgres && cache;
			return Response.json(
				{
					status: allOk ? "ok" : "degraded",
					services: {
						postgres: { status: postgres ? "ok" : "error" },
						redis: { status: cache ? "ok" : "error" },
					},
				},
				{ status: allOk ? 200 : 503 }
			);
		},
	});
}

async function main() {
	const config = resolveSlackConfig();

	if (!config.enabled) {
		log.info({ lifecycle: "disabled", reason: config.reason });
		await flushBatchedSlackDrain();
		process.exit(0);
	}

	const installations = new SlackInstallationStore(config.crypto);

	const app = new App({
		appToken: config.appToken,
		authorize: createSlackAuthorize(installations),
		clientOptions: {
			slackApiUrl: "https://slack.com/api",
		},
		logLevel: config.logLevel,
		signingSecret: config.signingSecret,
		socketMode: config.socketMode,
	});

	registerSlackListeners(
		app,
		new DatabuddyAgentClient(installations),
		installations
	);

	const healthPort =
		Number.parseInt(process.env.PORT ?? "", 10) ||
		(config.socketMode ? config.port : config.port + 1);
	startHealthServer(healthPort);

	try {
		if (config.socketMode) {
			await app.start();
		} else {
			await app.start(config.port);
		}
		console.info(
			config.socketMode
				? "[slack] Databuddy bot is running in Socket Mode"
				: `[slack] Databuddy bot is listening on port ${config.port}`
		);
		log.info({
			lifecycle: "started",
			slack_socket_mode: config.socketMode,
			...(config.socketMode ? {} : { slack_port: config.port }),
		});
	} catch (error) {
		captureSlackError(error, { lifecycle: "start_failed" });
		await flushBatchedSlackDrain();
		process.exit(1);
	}

	let shuttingDown = false;

	async function shutdown(signal: string) {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;
		const abortedRuns = abortAllSlackActiveRuns("shutdown");
		log.info({
			lifecycle: "shutdown",
			signal,
			slack_aborted_runs: abortedRuns,
		});
		await app
			.stop()
			.catch((error) =>
				captureSlackError(error, { lifecycle: "slack_stop_failed" })
			);
		await waitForSlackActiveRuns(SHUTDOWN_RUN_SETTLE_TIMEOUT_MS);
		await shutdownPostgres().catch((error) =>
			captureSlackError(error, { lifecycle: "postgres_shutdown_failed" })
		);
		await flushBatchedSlackDrain().catch((error) =>
			captureSlackError(error, { lifecycle: "drain_flush_failed" })
		);
		process.exit(0);
	}

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch(async (error) => {
	captureSlackError(error, { lifecycle: "main_failed" });
	await flushBatchedSlackDrain();
	process.exit(1);
});
