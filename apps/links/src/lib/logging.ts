import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readBooleanEnv } from "@databuddy/env/boolean";
import {
	createBatchedAxiomDrain,
	enrichHttpWideEvent,
	normalizeHttpWideEventForAxiom,
} from "@databuddy/shared/evlog-axiom";
import type { DrainContext, EnrichContext } from "evlog";
import { log } from "evlog";
import { useLogger as getRequestLogger } from "evlog/elysia";
import { createFsDrain } from "evlog/fs";

type LogField = string | number | boolean;
type LogFields = Record<string, LogField>;

const batchedAxiomDrain = createBatchedAxiomDrain(process.env.AXIOM_TOKEN);

const fsDrain =
	process.env.NODE_ENV === "development" || readBooleanEnv("LINKS_EVLOG_FS")
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

const drainToAxiom =
	process.env.NODE_ENV !== "development" && Boolean(process.env.AXIOM_TOKEN);

export async function drain(ctx: DrainContext): Promise<void> {
	normalizeHttpWideEventForAxiom(ctx.event as Record<string, unknown>);
	if (fsDrain) {
		await fsDrain(ctx);
	}
	if (drainToAxiom) {
		batchedAxiomDrain(ctx);
	}
}

export async function flushDrain(): Promise<void> {
	await batchedAxiomDrain.flush();
}

export function enrich(ctx: EnrichContext): void {
	enrichHttpWideEvent(ctx);
}

export function mergeWideEvent(fields: LogFields): void {
	try {
		getRequestLogger().set(fields as Record<string, unknown>);
	} catch {}
}

export async function record<T>(
	name: string,
	fn: () => Promise<T> | T
): Promise<T> {
	const start = performance.now();
	try {
		return await fn();
	} finally {
		const durationMs = Math.round((performance.now() - start) * 100) / 100;
		mergeWideEvent({ [`timing.${name}`]: durationMs });
	}
}

export function setAttributes(
	attrs: Record<string, string | number | boolean | null | undefined>
): void {
	const filtered: LogFields = {};
	for (const [k, v] of Object.entries(attrs)) {
		if (v != null) {
			filtered[k] = v;
		}
	}
	mergeWideEvent(filtered);
}

export function captureError(
	error: unknown,
	attributes?: Record<string, string | number | boolean>
): void {
	const err = error instanceof Error ? error : new Error(String(error));
	if (attributes?.error_step != null) {
		mergeWideEvent({ request_error: true, ...attributes });
	}
	try {
		const rl = getRequestLogger();
		if (attributes) {
			rl.error(err, attributes as Record<string, unknown>);
		} else {
			rl.error(err);
		}
	} catch {
		log.error({
			service: "links",
			error_message: err.message,
			...(attributes ?? {}),
		});
	}
}
