import { createORPCInstrumentation } from "@databuddy/rpc";
import { context, type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
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
			"X-Axiom-Dataset": process.env.AXIOM_DATASET ?? "api",
		},
	});

	sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: "api",
			[ATTR_SERVICE_VERSION]: pkg.version,
		}),
		spanProcessor: new BatchSpanProcessor(exporter, {
			scheduledDelayMillis: 1000,
			exportTimeoutMillis: 30_000,
			maxExportBatchSize: 512,
			maxQueueSize: 2048,
		}),
		instrumentations: [
			new HttpInstrumentation({
				ignoreIncomingRequestHook: (req: { url?: string }) => {
					// Don't trace health checks
					return req.url?.includes("/health") ?? false;
				},
			}),
			new PgInstrumentation(),
			createORPCInstrumentation(),
		],
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
	return trace.getTracer("api");
}

/**
 * Create a span - replaces @elysiajs/opentelemetry record
 */
export function record<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
	const tracer = getTracer();
	return tracer.startActiveSpan(name, async (span: Span) => {
		try {
			const result = await fn();
			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (error) {
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
 * Start HTTP request span and set it as active
 * Returns both the span and the context with the span set as active
 */
export function startRequestSpan(
	method: string,
	path: string,
	route?: string
): { span: Span; activeContext: ReturnType<typeof context.active> } {
	const tracer = getTracer();
	const span = tracer.startSpan(`${method} ${route ?? path}`, {
		kind: 1, // SERVER
		attributes: {
			http_method: method,
			http_route: route ?? path,
			http_target: path,
		},
	});

	// Create context with this span as active
	const activeContext = trace.setSpan(context.active(), span);

	return { span, activeContext };
}

/**
 * End HTTP request span
 */
export function endRequestSpan(
	span: Span,
	statusCode: number,
	startTime: number
): void {
	span.setAttribute("http_status_code", statusCode);
	span.setAttribute("http_response_duration_ms", Date.now() - startTime);
	span.setStatus({
		code: statusCode >= 400 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
		message: statusCode >= 400 ? `HTTP ${statusCode}` : undefined,
	});
	span.end();
}

/**
 * Capture and record an error
 */
export function captureError(
	error: unknown,
	attributes?: Record<string, string | number | boolean>
): void {
	const span = trace.getActiveSpan();
	if (span) {
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: error instanceof Error ? error.message : String(error),
		});
		span.recordException(
			error instanceof Error ? error : new Error(String(error))
		);
		if (attributes) {
			setAttributes(attributes);
		}
	}
}
