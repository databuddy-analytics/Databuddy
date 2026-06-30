import { AsyncLocalStorage } from "node:async_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readBooleanEnv } from "@databuddy/env/boolean";
import { env } from "@databuddy/env/insights";
import { createBatchedSuperlogDrain } from "@databuddy/shared/evlog-superlog";
import type { DrainContext, RequestLogger } from "evlog";
import { createLogger, log } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import { createFsDrain } from "evlog/fs";
import { createDrainPipeline } from "evlog/pipeline";

type PrimitiveLogValue = string | number | boolean;
type LogValue = PrimitiveLogValue | PrimitiveLogValue[];
type LogFields = Record<string, LogValue | null | undefined>;
type LogLevel = "error" | "info" | "warn";

const activeInsightsLog = new AsyncLocalStorage<RequestLogger>();

const axiomApiKey = env.AXIOM_API_KEY ?? env.AXIOM_TOKEN;

const pipeline = createDrainPipeline<DrainContext>({
	batch: { size: 50, intervalMs: 5000 },
	maxBufferSize: 2000,
});

const batchedAxiomDrain = axiomApiKey
	? pipeline(
			createAxiomDrain({
				apiKey: axiomApiKey,
				dataset: env.INSIGHTS_AXIOM_DATASET,
				...(env.AXIOM_ORG_ID ? { orgId: env.AXIOM_ORG_ID } : {}),
			})
		)
	: null;

const batchedSuperlogDrain = createBatchedSuperlogDrain();

const fsDrain =
	process.env.NODE_ENV === "development" || readBooleanEnv("INSIGHTS_EVLOG_FS")
		? createFsDrain({
				dir: join(
					dirname(fileURLToPath(import.meta.url)),
					"..",
					"..",
					".evlog",
					"logs"
				),
				pretty: false,
			})
		: null;

const deploymentMeta: Record<string, string> = {};
if (process.env.RAILWAY_REPLICA_ID) {
	deploymentMeta.instance_id = process.env.RAILWAY_REPLICA_ID;
}
if (process.env.RAILWAY_DEPLOYMENT_ID) {
	deploymentMeta.deployment_id = process.env.RAILWAY_DEPLOYMENT_ID;
}

function normalizeWideEventForAxiom(event: Record<string, unknown>): void {
	if (typeof event.error === "string") {
		event.error_message = event.error;
		event.error = undefined;
	}
	Object.assign(event, deploymentMeta);
}

export async function insightsLoggerDrain(ctx: DrainContext): Promise<void> {
	normalizeWideEventForAxiom(ctx.event as Record<string, unknown>);

	if (fsDrain) {
		await fsDrain(ctx);
	}
	for (const drain of [batchedAxiomDrain, batchedSuperlogDrain]) {
		if (!drain) {
			continue;
		}
		try {
			await drain(ctx);
		} catch {
			// Drain failures must not break background workers.
		}
	}
}

export async function flushBatchedInsightsDrain(): Promise<void> {
	await Promise.all([
		batchedAxiomDrain?.flush(),
		batchedSuperlogDrain?.flush(),
	]);
}

export function createInsightsEventLog(fields: LogFields): RequestLogger {
	return createLogger(cleanFields({ service: "insights", ...fields }));
}

export function getActiveInsightsLog(): RequestLogger {
	const logger = activeInsightsLog.getStore();
	if (!logger) {
		throw new Error("No active insights evlog context");
	}
	return logger;
}

export async function withInsightsLogContext<T>(
	logger: RequestLogger,
	fn: () => Promise<T>
): Promise<T> {
	return await activeInsightsLog.run(logger, fn);
}

export function setInsightsLog(fields: LogFields): void {
	activeInsightsLog.getStore()?.set(cleanFields(fields));
}

export function emitInsightsEvent(
	level: LogLevel,
	event: string,
	fields: LogFields = {}
): void {
	const payload = cleanFields({
		service: "insights",
		insights_event: event,
		...fields,
	});

	if (level === "error") {
		log.error(payload);
		return;
	}
	if (level === "warn") {
		log.warn(payload);
		return;
	}
	log.info(payload);
}

export function captureInsightsError(
	error: unknown,
	event: string,
	fields: LogFields = {}
): void {
	const err = toError(error);
	emitInsightsEvent("error", event, {
		...fields,
		error_message: err.message,
		error_stack: err.stack,
	});
}

export function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function cleanFields(fields: LogFields): Record<string, LogValue> {
	const clean: Record<string, LogValue> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined && value !== null) {
			clean[key] = value;
		}
	}
	return clean;
}
