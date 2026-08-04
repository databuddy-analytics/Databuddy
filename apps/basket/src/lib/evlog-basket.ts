import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readBooleanEnv } from "@databuddy/env/boolean";
import {
	createBatchedAxiomDrain,
	downgradeClientHttpError,
	enrichHttpWideEvent,
	normalizeWideEventForAxiom as normalizeSharedWideEventForAxiom,
} from "@databuddy/shared/evlog-axiom";
import { createBatchedSuperlogDrain } from "@databuddy/shared/evlog-superlog";
import { CLIENT_ERROR_MESSAGES } from "@lib/structured-errors";
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
	process.env.NODE_ENV === "development" || readBooleanEnv("BASKET_EVLOG_FS");

const drainToAxiom =
	process.env.NODE_ENV !== "development" && Boolean(process.env.AXIOM_TOKEN);

const devFsDrain = useLocalEvlogFiles
	? createFsDrain({ dir: devFsLogsDir, pretty: false })
	: null;

function isBasketClientHttpError(event: Record<string, unknown>): boolean {
	const status = event.http_status;
	if (typeof status === "number" && status >= 400 && status < 500) {
		return true;
	}
	const message = event.error_message;
	return typeof message === "string" && CLIENT_ERROR_MESSAGES.has(message);
}

export function normalizeWideEventForAxiom(
	event: Record<string, unknown>
): void {
	normalizeSharedWideEventForAxiom(event);
	if (isBasketClientHttpError(event)) {
		downgradeClientHttpError(event);
	}
}

export async function basketLoggerDrain(ctx: DrainContext): Promise<void> {
	if (ctx.event.method === "OPTIONS") {
		return;
	}

	normalizeWideEventForAxiom(ctx.event as Record<string, unknown>);

	if (devFsDrain) {
		await devFsDrain(ctx);
	}
	if (drainToAxiom) {
		batchedAxiomDrain(ctx);
	}
	batchedSuperlogDrain?.(ctx);
}

export function enrichBasketWideEvent(ctx: EnrichContext): void {
	enrichHttpWideEvent(ctx);
}

export async function flushBatchedAxiomDrain(): Promise<void> {
	await Promise.all([batchedAxiomDrain.flush(), batchedSuperlogDrain?.flush()]);
}
