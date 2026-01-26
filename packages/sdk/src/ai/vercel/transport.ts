import type { AICall, Transport } from "./types";

/**
 * Create default HTTP transport
 * Owner is determined by the API key on the server side
 */
export const createDefaultTransport = (
	apiUrl: string,
	apiKey?: string
): Transport => {
	return async (call) => {
		const headers: HeadersInit = {
			"Content-Type": "application/json",
		};

		if (apiKey) {
			headers.Authorization = `Bearer ${apiKey}`;
		}

		const response = await fetch(apiUrl, {
			method: "POST",
			headers,
			body: JSON.stringify(call),
		});

		if (!response.ok) {
			throw new Error(
				`Failed to send AI log: ${response.status} ${response.statusText}`
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
 *   transport: httpTransport("https://api.example.com/ai-logs", "api-key"),
 * });
 * ```
 */
export const httpTransport = (url: string, apiKey?: string): Transport => {
	return async (call: AICall) => {
		const headers: HeadersInit = {
			"Content-Type": "application/json",
		};

		if (apiKey) {
			headers.Authorization = `Bearer ${apiKey}`;
		}

		const response = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(call),
		});

		if (!response.ok) {
			throw new Error(
				`Failed to send AI log: ${response.status} ${response.statusText}`
			);
		}
	};
};
