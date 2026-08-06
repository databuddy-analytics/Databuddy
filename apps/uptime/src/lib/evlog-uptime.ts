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
	process.env.NODE_ENV === "development" || readBooleanEnv("UPTIME_EVLOG_FS");

const drainToAxiom =
	process.env.NODE_ENV !== "development" && Boolean(process.env.AXIOM_TOKEN);

const devFsDrain = useLocalEvlogFiles
	? createFsDrain({ dir: devFsLogsDir, pretty: false })
	: null;

export async function uptimeLoggerDrain(ctx: DrainContext): Promise<void> {
	normalizeHttpWideEventForAxiom(ctx.event as Record<string, unknown>);

	if (devFsDrain) {
		await devFsDrain(ctx);
	}
	if (drainToAxiom) {
		batchedAxiomDrain(ctx);
	}
	batchedSuperlogDrain?.(ctx);
}

const deploymentMeta: Record<string, string> = {};
if (process.env.RAILWAY_REPLICA_ID) {
	deploymentMeta.instance_id = process.env.RAILWAY_REPLICA_ID;
}
if (process.env.RAILWAY_DEPLOYMENT_ID) {
	deploymentMeta.deployment_id = process.env.RAILWAY_DEPLOYMENT_ID;
}

export function enrichUptimeWideEvent(ctx: EnrichContext): void {
	enrichHttpWideEvent(ctx);
	Object.assign(ctx.event, deploymentMeta);
}

export async function flushBatchedUptimeDrain(): Promise<void> {
	await Promise.all([batchedAxiomDrain.flush(), batchedSuperlogDrain?.flush()]);
}
