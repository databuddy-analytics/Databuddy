import { AsyncLocalStorage } from "node:async_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readBooleanEnv } from "@databuddy/env/boolean";
import { env } from "@databuddy/env/slack";
import { createBatchedSuperlogDrain } from "@databuddy/shared/evlog-superlog";
import type { DrainContext, RequestLogger } from "evlog";
import { createLogger, log } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import { createFsDrain } from "evlog/fs";
import { createDrainPipeline } from "evlog/pipeline";

type SlackLogValue = string | number | boolean;
type SlackLogFields = Record<string, SlackLogValue | null | undefined>;

const activeSlackLog = new AsyncLocalStorage<RequestLogger>();

const axiomApiKey = env.AXIOM_API_KEY ?? env.AXIOM_TOKEN;

const batchedAxiomDrain = axiomApiKey
	? createDrainPipeline<DrainContext>({
			batch: { size: 50, intervalMs: 5000 },
			maxBufferSize: 2000,
		})(
			createAxiomDrain({
				apiKey: axiomApiKey,
				dataset: env.SLACK_AXIOM_DATASET,
				...(env.AXIOM_ORG_ID ? { orgId: env.AXIOM_ORG_ID } : {}),
			})
		)
	: null;

const batchedSuperlogDrain = createBatchedSuperlogDrain();

const fsDrain =
	env.NODE_ENV === "development" || readBooleanEnv("SLACK_EVLOG_FS")
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

export async function slackLoggerDrain(ctx: DrainContext): Promise<void> {
	const event = ctx.event as Record<string, unknown>;
	if (typeof event.error === "string") {
		event.error_message = event.error;
		event.error = undefined;
	}

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
			// Drain failures must not break Slack event handling.
		}
	}
}

export async function flushBatchedSlackDrain(): Promise<void> {
	await Promise.all([
		batchedAxiomDrain?.flush(),
		batchedSuperlogDrain?.flush(),
	]);
}

export function createSlackEventLog(fields: SlackLogFields): RequestLogger {
	return createLogger(cleanFields({ service: "slack", ...fields }));
}

export function getActiveSlackLog(): RequestLogger {
	const logger = activeSlackLog.getStore();
	if (!logger) {
		throw new Error("No active Slack evlog context");
	}
	return logger;
}

export function setActiveSlackLog(fields: SlackLogFields): void {
	activeSlackLog.getStore()?.set(cleanFields(fields));
}

export async function withSlackLogContext<T>(
	logger: RequestLogger,
	fn: () => Promise<T>
): Promise<T> {
	return await activeSlackLog.run(logger, fn);
}

export function setSlackLog(
	logger: RequestLogger | undefined,
	fields: SlackLogFields
): void {
	logger?.set(cleanFields(fields));
}

export function captureSlackError(
	error: unknown,
	fields?: SlackLogFields
): void {
	const err = toError(error);
	log.error({
		service: "slack",
		error_message: err.message,
		error_stack: err.stack,
		...cleanFields(fields ?? {}),
	});
}

export function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export function getSlackApiErrorCode(error: unknown): string | undefined {
	if (!isRecord(error)) {
		return;
	}

	const data = error.data;
	if (isRecord(data) && typeof data.error === "string") {
		return data.error;
	}

	return typeof error.code === "string" ? error.code : undefined;
}

function cleanFields(fields: SlackLogFields): Record<string, SlackLogValue> {
	const clean: Record<string, SlackLogValue> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined && value !== null) {
			clean[key] = value;
		}
	}
	return clean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
