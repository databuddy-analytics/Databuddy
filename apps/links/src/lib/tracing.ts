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

export function initTracing(): void {
	if (sdk) {
		return;
	}

	const exporter = new OTLPTraceExporter({
		url: "https://api.axiom.co/v1/traces",
		headers: {
			Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
			"X-Axiom-Dataset": process.env.AXIOM_DATASET ?? "links",
		},
	});

	sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: "links",
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

function getTracer() {
	return trace.getTracer("links");
}

export function record<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
	const tracer = getTracer();
	return tracer.startActiveSpan(name, async (span) => {
		const startTime = Date.now();
		try {
			const result = await fn();
			const duration = Date.now() - startTime;
			span.setAttribute("duration_ms", duration);

			if (duration > 100) {
				span.setAttribute("slow", true);
			}

			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			span.setAttribute("duration_ms", duration);
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

export function captureError(
	error: unknown,
	attributes?: Record<string, string | number | boolean>
): void {
	const errorObj = error instanceof Error ? error : new Error(String(error));
	const errorMessage = errorObj.message;
	const errorStack = errorObj.stack;

	console.error("[links] Error:", errorMessage, {
		error: errorMessage,
		stack: errorStack,
		...(attributes ?? {}),
	});

	const span = trace.getActiveSpan();
	if (!span) {
		return;
	}

	span.recordException(errorObj);
	span.setStatus({ code: SpanStatusCode.ERROR });

	if (attributes) {
		for (const [key, value] of Object.entries(attributes)) {
			span.setAttribute(key, value);
		}
	}
}

export function setAttributes(
	attributes: Record<string, string | number | boolean | null | undefined>
): void {
	const span = trace.getActiveSpan();
	if (span) {
		for (const [key, value] of Object.entries(attributes)) {
			if (value !== null && value !== undefined) {
				span.setAttribute(key, value);
			}
		}
	}
}

export function startRequestSpan(
	method: string,
	path: string,
	route?: string
): Span {
	const tracer = getTracer();
	return tracer.startSpan(`${method} ${route ?? path}`, {
		kind: 1,
		attributes: {
			http_method: method,
			http_route: route ?? path,
			http_target: path,
		},
	});
}

export function endRequestSpan(
	span: Span,
	statusCode: number,
	startTime: number
): void {
	const duration = Date.now() - startTime;
	span.setAttribute("http_status_code", statusCode);
	span.setAttribute("http_response_duration_ms", duration);

	if (duration > 100) {
		span.setAttribute("http_slow", true);
	}

	span.setStatus({
		code: statusCode >= 400 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
		message: statusCode >= 400 ? `HTTP ${statusCode}` : undefined,
	});
	span.end();
}
