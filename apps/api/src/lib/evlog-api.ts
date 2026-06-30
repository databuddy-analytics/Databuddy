import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readBooleanEnv } from "@databuddy/env/boolean";
import { createBatchedSuperlogDrain } from "@databuddy/shared/evlog-superlog";
import type { DrainContext, EnrichContext } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import {
	createRequestSizeEnricher,
	createTraceContextEnricher,
	createUserAgentEnricher,
} from "evlog/enrichers";
import { createFsDrain } from "evlog/fs";
import { createDrainPipeline } from "evlog/pipeline";

const batchedAxiomDrain = createDrainPipeline<DrainContext>({
	batch: { size: 50, intervalMs: 5000 },
	maxBufferSize: 2000,
})(createAxiomDrain());

const batchedSuperlogDrain = createBatchedSuperlogDrain();

const devFsLogsDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	".evlog",
	"logs"
);

const useLocalEvlogFiles =
	process.env.NODE_ENV === "development" || readBooleanEnv("API_EVLOG_FS");

const devFsDrain = useLocalEvlogFiles
	? createFsDrain({ dir: devFsLogsDir, pretty: false })
	: null;

const DURATION_REGEX = /^([\d.]+)(ms|s)$/;

function stripErrorCauseData(err: Record<string, unknown>): void {
	const cause = err.cause;
	if (cause && typeof cause === "object" && !Array.isArray(cause)) {
		(cause as Record<string, unknown>).data = undefined;
	}
}

function normalizeWideEventForAxiom(event: Record<string, unknown>): void {
	if (typeof event.error === "string") {
		event.error_message = event.error;
		event.error = undefined;
	}

	const err = event.error;
	if (err && typeof err === "object" && !Array.isArray(err)) {
		stripErrorCauseData(err as Record<string, unknown>);
	}

	if (event.level !== "error") {
		return;
	}

	if (!err || typeof err !== "object" || Array.isArray(err)) {
		return;
	}

	const status = (err as { status?: number }).status;
	if (typeof status === "number" && status >= 400 && status < 500) {
		event.level = "warn";
		event.client_http_error = true;
	}
}

function parseDurationMs(duration: unknown): number | undefined {
	if (typeof duration !== "string") {
		return;
	}
	const match = duration.match(DURATION_REGEX);
	if (!match?.[1]) {
		return;
	}
	return match[2] === "s"
		? Math.round(Number.parseFloat(match[1]) * 1000)
		: Math.round(Number.parseFloat(match[1]));
}

export async function apiLoggerDrain(ctx: DrainContext): Promise<void> {
	normalizeWideEventForAxiom(ctx.event as Record<string, unknown>);

	const durationMs = parseDurationMs(ctx.event.duration);
	if (durationMs !== undefined) {
		ctx.event.duration_ms = durationMs;
	}

	if (devFsDrain) {
		await devFsDrain(ctx);
	}
	batchedAxiomDrain(ctx);
	batchedSuperlogDrain?.(ctx);
}

const enrichers = [
	createUserAgentEnricher(),
	createRequestSizeEnricher(),
	createTraceContextEnricher(),
] as const;

export function enrichApiWideEvent(ctx: EnrichContext): void {
	for (const enricher of enrichers) {
		enricher(ctx);
	}
}

export async function flushBatchedApiDrain(): Promise<void> {
	await Promise.all([batchedAxiomDrain.flush(), batchedSuperlogDrain?.flush()]);
}
