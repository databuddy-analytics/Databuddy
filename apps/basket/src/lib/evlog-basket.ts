import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DrainContext, EnrichContext } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import {
	createRequestSizeEnricher,
	createTraceContextEnricher,
	createUserAgentEnricher,
} from "evlog/enrichers";
import { createFsDrain } from "evlog/fs";
import { createDrainPipeline } from "evlog/pipeline";

const pipeline = createDrainPipeline<DrainContext>({
	batch: { size: 50, intervalMs: 5000 },
	maxBufferSize: 2000,
});

const axiomDrain = createAxiomDrain();

/**
 * Batched Axiom drain; call {@link flushBatchedAxiomDrain} on shutdown.
 */
const batchedAxiomDrain = pipeline(axiomDrain);

const devFsLogsDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	".evlog",
	"logs"
);

const useLocalEvlogFiles =
	process.env.NODE_ENV === "development" || process.env.BASKET_EVLOG_FS === "1";

const devFsDrain = useLocalEvlogFiles
	? createFsDrain({ dir: devFsLogsDir, pretty: false })
	: null;

/**
 * In development, writes NDJSON wide events to `apps/basket/.evlog/logs/` (analyze-logs skill)
 * and still sends to Axiom via the batched pipeline. Production: Axiom only.
 */
export async function basketLoggerDrain(ctx: DrainContext): Promise<void> {
	if (devFsDrain) {
		await devFsDrain(ctx);
	}
	batchedAxiomDrain(ctx);
}

const enrichers = [
	createUserAgentEnricher(),
	createRequestSizeEnricher(),
	createTraceContextEnricher(),
] as const;

export function enrichBasketWideEvent(ctx: EnrichContext): void {
	for (const enricher of enrichers) {
		enricher(ctx);
	}
}

export async function flushBatchedAxiomDrain(): Promise<void> {
	await batchedAxiomDrain.flush();
}
