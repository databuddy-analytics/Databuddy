import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DrainContext, EnrichContext } from "evlog";
import { log } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import { useLogger as getRequestLogger } from "evlog/elysia";
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

const fsDrain =
	process.env.NODE_ENV === "development" || process.env.LINKS_EVLOG_FS === "1"
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

const DURATION_RE = /^([\d.]+)(ms|s)$/;

function normalizeDrainEvent(event: Record<string, unknown>): void {
	if (typeof event.error === "string") {
		event.error_message = event.error;
		event.error = undefined;
	}

	if (event.level === "error") {
		const err = event.error;
		if (err && typeof err === "object" && !Array.isArray(err)) {
			const status = (err as { status?: number }).status;
			if (typeof status === "number" && status >= 400 && status < 500) {
				event.level = "warn";
				event.client_http_error = true;
			}
		}
	}

	const d = event.duration;
	if (typeof d === "string") {
		const m = d.match(DURATION_RE);
		if (m?.[1]) {
			event.duration_ms =
				m[2] === "s"
					? Math.round(Number.parseFloat(m[1]) * 1000)
					: Math.round(Number.parseFloat(m[1]));
		}
	}
}

export async function drain(ctx: DrainContext): Promise<void> {
	normalizeDrainEvent(ctx.event as Record<string, unknown>);
	if (fsDrain) {
		await fsDrain(ctx);
	}
	batchedAxiomDrain(ctx);
}

export async function flushDrain(): Promise<void> {
	await batchedAxiomDrain.flush();
}

const enrichers = [
	createUserAgentEnricher(),
	createRequestSizeEnricher(),
	createTraceContextEnricher(),
] as const;

export function enrich(ctx: EnrichContext): void {
	for (const e of enrichers) {
		e(ctx);
	}
}

export function mergeWideEvent(
	fields: Record<string, string | number | boolean>
): void {
	try {
		getRequestLogger().set(fields as Record<string, unknown>);
	} catch {}
}

export function setAttributes(
	attrs: Record<string, string | number | boolean | null | undefined>
): void {
	const filtered: Record<string, string | number | boolean> = {};
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
