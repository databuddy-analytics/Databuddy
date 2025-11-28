import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import {
	ATTR_SERVICE_NAME,
	ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import pkg from "../../package.json";

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry
 */
export function initTracing(): void {
	if (sdk) {
		return;
	}

	const exporter = new OTLPTraceExporter({
		url: "https://api.axiom.co/v1/traces",
		headers: {
			Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
			"X-Axiom-Dataset": process.env.AXIOM_DATASET ?? "basket",
		},
	});

	sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: "basket",
			[ATTR_SERVICE_VERSION]: pkg.version,
		}),
		spanProcessor: new BatchSpanProcessor(exporter, {
			scheduledDelayMillis: 1000,
			exportTimeoutMillis: 30_000,
			maxExportBatchSize: 512,
			maxQueueSize: 2048,
		}),
	});

	sdk.start();
}

export async function shutdownTracing(): Promise<void> {
	if (sdk) {
		await sdk.shutdown();
		sdk = null;
	}
}

/**
 * Get tracer
 */
function getTracer() {
	return trace.getTracer("basket");
}

/**
 * Create a span - replaces @elysiajs/opentelemetry record
 */
export function record<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
	const tracer = getTracer();
	return tracer.startActiveSpan(name, async (span) => {
		const startTime = Date.now();
		try {
			const result = await fn();
			const duration = Date.now() - startTime;
			span.setAttribute("operation.duration_ms", duration);

			if (duration > 1000) {
				span.setAttribute("operation.slow", true);
				span.setAttribute("operation.duration_seconds", duration / 1000);
			}

			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			span.setAttribute("operation.duration_ms", duration);
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error instanceof Error ? error.message : String(error),
			});
			span.recordException(
				error instanceof Error ? error : new Error(String(error))
			);
			throw error;
		} finally {
			span.end();
		}
	});
}

/**
 * Capture error in active span
 */
export function captureError(
	error: unknown,
	attributes?: Record<string, string | number | boolean>
): void {
	const span = trace.getActiveSpan();
	if (!span) {
		return;
	}

	span.recordException(
		error instanceof Error ? error : new Error(String(error))
	);
	span.setStatus({ code: SpanStatusCode.ERROR });

	if (attributes) {
		for (const [key, value] of Object.entries(attributes)) {
			span.setAttribute(key, value);
		}
	}
}

/**
 * Set attributes on active span - replaces @elysiajs/opentelemetry setAttributes
 */
export function setAttributes(
	attributes: Record<string, string | number | boolean>
): void {
	const span = trace.getActiveSpan();
	if (span) {
		for (const [key, value] of Object.entries(attributes)) {
			span.setAttribute(key, value);
		}
	}
}

/**
 * Start HTTP request span
 */
export function startRequestSpan(
	method: string,
	path: string,
	route?: string
): Span {
	const tracer = getTracer();
	return tracer.startSpan(`${method} ${route ?? path}`, {
		kind: 1, // SERVER
		attributes: {
			"http.method": method,
			"http.route": route ?? path,
			"http.target": path,
		},
	});
}

/**
 * End HTTP request span
 */
export function endRequestSpan(
	span: Span,
	statusCode: number,
	startTime: number
): void {
	const duration = Date.now() - startTime;
	span.setAttribute("http.status_code", statusCode);
	span.setAttribute("http.response.duration_ms", duration);

	if (duration > 500) {
		span.setAttribute("http.slow", true);
		span.setAttribute("http.duration_seconds", duration / 1000);
	}

	span.setStatus({
		code: statusCode >= 400 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
		message: statusCode >= 400 ? `HTTP ${statusCode}` : undefined,
	});
	span.end();
}
