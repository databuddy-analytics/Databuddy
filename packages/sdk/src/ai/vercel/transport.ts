import type { AICall, Transport } from "./types";

/**
 * Create default HTTP transport
 */
export const createDefaultTransport = (
	apiUrl: string,
	clientId?: string,
	apiKey?: string,
): Transport => {
	return async (call) => {
		const headers: HeadersInit = {
			"Content-Type": "application/json",
		};

		if (apiKey) {
			headers.Authorization = `Bearer ${apiKey}`;
		}

		if (clientId) {
			headers["databuddy-client-id"] = clientId;
		}

		const response = await fetch(apiUrl, {
			method: "POST",
			headers,
			body: JSON.stringify(call),
		});

		if (!response.ok) {
			throw new Error(
				`Failed to send AI log: ${response.status} ${response.statusText}`,
			);
		}
	};
};

/**
 * Create an HTTP transport that sends logs to an API endpoint
 *
 * @example
 * ```ts
 * import { databuddyLLM, httpTransport } from "@databuddy/sdk/ai/vercel";
 *
 * const { track } = databuddyLLM({
 *   transport: httpTransport("https://api.example.com/ai-logs", "client-id", "api-key"),
 * });
 * ```
 */
export const httpTransport = (
	url: string,
	clientId?: string,
	apiKey?: string,
): Transport => {
	return async (call: AICall) => {
		const headers: HeadersInit = {
			"Content-Type": "application/json",
		};

		if (apiKey) {
			headers.Authorization = `Bearer ${apiKey}`;
		}

		if (clientId) {
			headers["databuddy-client-id"] = clientId;
		}

		const response = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(call),
		});

		if (!response.ok) {
			throw new Error(
				`Failed to send AI log: ${response.status} ${response.statusText}`,
			);
		}
	};
};
