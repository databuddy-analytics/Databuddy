import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readBooleanEnv } from "@databuddy/env/boolean";
import {
	createBatchedAxiomDrain,
	enrichHttpWideEvent,
	normalizeHttpWideEventForAxiom,
} from "@databuddy/shared/evlog-axiom";
import { createBatchedSuperlogDrain } from "@databuddy/shared/evlog-superlog";
import type { DrainContext, EnrichContext } from "evlog";
import { createFsDrain } from "evlog/fs";

const batchedAxiomDrain = createBatchedAxiomDrain(process.env.AXIOM_TOKEN);

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

const drainToAxiom =
	process.env.NODE_ENV !== "development" && Boolean(process.env.AXIOM_TOKEN);

const devFsDrain = useLocalEvlogFiles
	? createFsDrain({ dir: devFsLogsDir, pretty: false })
	: null;

function stripErrorCauseData(event: Record<string, unknown>): void {
	const error = event.error;
	if (!isRecord(error)) {
		return;
	}

	const cause = error.cause;
	if (isRecord(cause)) {
		cause.data = undefined;
	}
}

export async function apiLoggerDrain(ctx: DrainContext): Promise<void> {
	const event = ctx.event as Record<string, unknown>;
	stripErrorCauseData(event);
	normalizeHttpWideEventForAxiom(event);

	if (devFsDrain) {
		await devFsDrain(ctx);
	}
	if (drainToAxiom) {
		batchedAxiomDrain(ctx);
	}
	batchedSuperlogDrain?.(ctx);
}

export function enrichApiWideEvent(ctx: EnrichContext): void {
	enrichHttpWideEvent(ctx);
}

export async function flushBatchedApiDrain(): Promise<void> {
	await Promise.all([batchedAxiomDrain.flush(), batchedSuperlogDrain?.flush()]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
