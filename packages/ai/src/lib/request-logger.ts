import type { RequestLogger } from "evlog";

type RequestLoggerProvider = () => RequestLogger;

let requestLoggerProvider: RequestLoggerProvider | null = null;

export function setAiRequestLoggerProvider(
	provider: RequestLoggerProvider | null
): void {
	requestLoggerProvider = provider;
}

export function getActiveAiRequestLogger(): RequestLogger | null {
	if (!requestLoggerProvider) {
		return null;
	}
	try {
		return requestLoggerProvider();
	} catch {
		return null;
	}
}
