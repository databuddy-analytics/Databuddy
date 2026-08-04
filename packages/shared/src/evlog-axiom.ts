import type { DrainContext, EnrichContext } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import {
	createRequestSizeEnricher,
	createTraceContextEnricher,
	createUserAgentEnricher,
} from "evlog/enrichers";
import { createDrainPipeline } from "evlog/pipeline";

const createAxiomPipeline = createDrainPipeline<DrainContext>({
	batch: { size: 50, intervalMs: 5000 },
	maxBufferSize: 2000,
});

const durationPattern = /^([\d.]+)(ms|s)$/;

const httpEnrichers = [
	createUserAgentEnricher(),
	createRequestSizeEnricher(),
	createTraceContextEnricher(),
] as const;

export function createBatchedAxiomDrain(
	apiKey: string | undefined,
	dataset?: string
) {
	return createAxiomPipeline(
		createAxiomDrain({
			apiKey,
			...(dataset ? { dataset } : {}),
		})
	);
}

export function normalizeWideEventForAxiom(
	event: Record<string, unknown>
): void {
	if (typeof event.error === "string") {
		event.error_message = event.error;
		event.error = undefined;
	}

	const durationMs = parseDurationMs(event.duration);
	if (durationMs !== undefined) {
		event.duration_ms = durationMs;
	}
}

export function normalizeHttpWideEventForAxiom(
	event: Record<string, unknown>
): void {
	normalizeWideEventForAxiom(event);
	if (hasClientHttpError(event)) {
		downgradeClientHttpError(event);
	}
}

export function downgradeClientHttpError(event: Record<string, unknown>): void {
	if (event.level !== "error") {
		return;
	}

	event.level = "warn";
	event.client_http_error = true;
}

export function enrichHttpWideEvent(ctx: EnrichContext): void {
	for (const enrich of httpEnrichers) {
		enrich(ctx);
	}
}

function hasClientHttpError(event: Record<string, unknown>): boolean {
	if (event.level !== "error") {
		return false;
	}

	const error = event.error;
	if (!isRecord(error)) {
		return false;
	}

	const status = error.status;
	return typeof status === "number" && status >= 400 && status < 500;
}

function parseDurationMs(duration: unknown): number | undefined {
	if (typeof duration !== "string") {
		return;
	}

	const match = duration.match(durationPattern);
	if (!match?.[1]) {
		return;
	}

	const durationMs = Number.parseFloat(match[1]);
	return Math.round(match[2] === "s" ? durationMs * 1000 : durationMs);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
