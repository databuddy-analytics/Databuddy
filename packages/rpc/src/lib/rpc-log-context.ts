import type {
	RpcProcedureType,
	RpcWideEventFields,
} from "@databuddy/shared/evlog-fields";
import { log, type RequestLogger } from "evlog";

type RequestLoggerProvider = () => RequestLogger;
interface RpcContextWithHeaders {
	headers?: Headers | null;
}

let requestLoggerProvider: RequestLoggerProvider | null = null;

export function setRpcRequestLoggerProvider(
	provider: RequestLoggerProvider | null
): void {
	requestLoggerProvider = provider;
}

function getActiveRpcRequestLogger(): RequestLogger | null {
	if (!requestLoggerProvider) {
		return null;
	}
	try {
		return requestLoggerProvider();
	} catch {
		return null;
	}
}

function setOrLog(fields: Partial<RpcWideEventFields>): void {
	const requestLogger = getActiveRpcRequestLogger();
	const payload = fields as Record<string, unknown>;
	if (requestLogger) {
		requestLogger.set(payload);
		return;
	}
	log.info({ service: "rpc", ...payload });
}

export function enrichRpcWideEventContext(
	context: RpcContextWithHeaders
): void {
	if (!context.headers) {
		return;
	}

	const fields: Partial<RpcWideEventFields> = {};

	const clientId = context.headers.get("databuddy-client-id");
	if (clientId) {
		fields.rpc_client_id = clientId;
	}

	const sdkName = context.headers.get("databuddy-sdk-name");
	if (sdkName) {
		fields.rpc_sdk_name = sdkName;
	}

	const sdkVersion = context.headers.get("databuddy-sdk-version");
	if (sdkVersion) {
		fields.rpc_sdk_version = sdkVersion;
	}

	if (Object.keys(fields).length === 0) {
		return;
	}

	setOrLog(fields);
}

export function setRpcProcedureType(procedureType: RpcProcedureType): void {
	setOrLog({ rpc_procedure_type: procedureType });
}

export function setRpcProcedurePath(path: readonly string[]): void {
	if (path.length === 0) {
		return;
	}
	setOrLog({
		rpc_procedure: path.join("."),
		rpc_router: path[0],
	});
}

export function recordORPCError(error: {
	code?: string;
	message?: string;
}): void {
	const message = error.message ?? error.code ?? "Unknown error";
	const err = new Error(message);
	const requestLogger = getActiveRpcRequestLogger();
	if (requestLogger) {
		const fields = {
			rpc_error_code: error.code,
			rpc_error_message: error.message,
		} satisfies Partial<RpcWideEventFields>;
		requestLogger.error(err, fields);
		return;
	}
	const fields = {
		service: "rpc",
		rpc_error_code: error.code,
		rpc_error_message: error.message,
	} satisfies Partial<RpcWideEventFields> & { service: "rpc" };
	log.error(fields);
}

export function createAbortSignalInterceptor<T = unknown>() {
	return ({
		request,
		next,
	}: {
		request: { signal?: AbortSignal };
		next: () => T;
	}) => {
		request.signal?.addEventListener("abort", () => {
			setOrLog({
				rpc_request_aborted: true,
				rpc_abort_reason: String(request.signal?.reason),
			});
		});

		return next();
	};
}
