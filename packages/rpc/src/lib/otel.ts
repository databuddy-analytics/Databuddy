import { SpanStatusCode, trace } from "@opentelemetry/api";
import { ORPCInstrumentation } from "@orpc/otel";
import type { Context } from "../orpc";

/**
 * Create ORPCInstrumentation instance for OpenTelemetry integration
 */
export function createORPCInstrumentation(): ORPCInstrumentation {
	return new ORPCInstrumentation();
}

/**
 * Enrich the active span with RPC context information
 */
export function enrichSpanWithContext(context: Context): void {
	const span = trace.getActiveSpan();
	if (!span) {
		return;
	}

	// Add user information
	if (context.user) {
		span.setAttribute("rpc.user.id", context.user.id);
		span.setAttribute("rpc.user.email", context.user.email ?? "");
		span.setAttribute("rpc.user.role", context.user.role ?? "");
	}

	// Add session information
	if (context.session) {
		span.setAttribute("rpc.session.id", context.session.id);
	}

	// Add request metadata
	if (context.headers) {
		const userAgent = context.headers.get("user-agent");
		if (userAgent) {
			span.setAttribute("http.user_agent", userAgent);
		}

		const clientId = context.headers.get("databuddy-client-id");
		if (clientId) {
			span.setAttribute("rpc.client.id", clientId);
		}

		const sdkName = context.headers.get("databuddy-sdk-name");
		if (sdkName) {
			span.setAttribute("rpc.sdk.name", sdkName);
		}

		const sdkVersion = context.headers.get("databuddy-sdk-version");
		if (sdkVersion) {
			span.setAttribute("rpc.sdk.version", sdkVersion);
		}
	}
}

/**
 * Set attributes on the active span for a procedure type
 */
export function setProcedureAttributes(
	procedureType: "public" | "protected" | "admin"
): void {
	const span = trace.getActiveSpan();
	if (span) {
		span.setAttribute("rpc.procedure.type", procedureType);
	}
}

/**
 * Record an ORPCError on the active span
 */
export function recordORPCError(error: {
	code?: string;
	message?: string;
}): void {
	const span = trace.getActiveSpan();
	if (!span) {
		return;
	}

	span.setStatus({
		code: SpanStatusCode.ERROR,
		message: error.message ?? error.code ?? "Unknown error",
	});

	if (error.code) {
		span.setAttribute("rpc.error.code", error.code);
	}

	if (error.message) {
		span.setAttribute("rpc.error.message", error.message);
	}

	if (error instanceof Error) {
		span.recordException(error);
	}
}

/**
 * Record uncaught errors in OpenTelemetry spans
 */
export function recordError(eventName: string, reason: unknown): void {
	const tracer = trace.getTracer("uncaught-errors");
	const span = tracer.startSpan(eventName);
	const message = String(reason);

	if (reason instanceof Error) {
		span.recordException(reason);
	} else {
		span.recordException({ message });
	}

	span.setStatus({ code: SpanStatusCode.ERROR, message });
	span.end();
}

/**
 * Setup uncaught exception handlers with OpenTelemetry
 */
export function setupUncaughtErrorHandlers(): void {
	process.on("uncaughtException", (reason) => {
		recordError("uncaughtException", reason);
	});

	process.on("unhandledRejection", (reason) => {
		recordError("unhandledRejection", reason);
	});
}

/**
 * Create an interceptor to capture abort signals in OpenTelemetry spans
 */
export function createAbortSignalInterceptor<T = unknown>() {
	return ({
		request,
		next,
	}: {
		request: { signal?: AbortSignal };
		next: () => T;
	}) => {
		const span = trace.getActiveSpan();

		request.signal?.addEventListener("abort", () => {
			span?.addEvent("aborted", { reason: String(request.signal?.reason) });
		});

		return next();
	};
}
