import { Agent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import type {
	BatchEventPayload,
	FlushResponse,
	CompressionConfig,
	Logger,
} from "../types";
import { compressPayload, type CompressionResult } from "./compression";
import { createHttpError } from "../retry/errors";

/**
 * HTTP transport configuration
 */
export interface HttpTransportConfig {
	apiUrl: string;
	clientId: string;
	timeout: number;
	compression: Required<CompressionConfig> | false;
	logger: Logger;
}

/**
 * HTTP transport with connection pooling and compression
 */
export class HttpTransport {
	private readonly config: HttpTransportConfig;
	private readonly agent: Agent | HttpsAgent;
	private readonly abortControllers: Set<AbortController> = new Set();

	constructor(config: HttpTransportConfig) {
		this.config = config;

		// Create appropriate agent based on protocol
		const isHttps = config.apiUrl.startsWith("https");
		const AgentClass = isHttps ? HttpsAgent : Agent;

		this.agent = new AgentClass({
			keepAlive: true,
			keepAliveMsecs: 30000,
			maxSockets: 10,
			maxFreeSockets: 5,
			timeout: config.timeout,
		});
	}

	/**
	 * Send a batch of events to the API
	 */
	async sendBatch(events: BatchEventPayload[]): Promise<{
		response: FlushResponse;
		compressionResult?: CompressionResult;
	}> {
		const url = `${this.config.apiUrl}/batch?client_id=${encodeURIComponent(this.config.clientId)}`;
		const jsonPayload = JSON.stringify(events);

		// Handle compression
		let body: Buffer | string = jsonPayload;
		let contentEncoding: string | null = null;
		let compressionResult: CompressionResult | undefined;

		if (this.config.compression !== false) {
			compressionResult = compressPayload(jsonPayload, this.config.compression);
			body = compressionResult.data;
			contentEncoding = compressionResult.encoding;

			if (contentEncoding) {
				this.config.logger.debug("Compressed payload", {
					originalSize: compressionResult.originalSize,
					compressedSize: compressionResult.compressedSize,
					ratio: (
						(1 - compressionResult.compressedSize / compressionResult.originalSize) *
						100
					).toFixed(1) + "%",
				});
			}
		}

		// Create abort controller for timeout
		const controller = new AbortController();
		this.abortControllers.add(controller);

		const timeoutId = setTimeout(() => {
			controller.abort();
		}, this.config.timeout);

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};

			if (contentEncoding) {
				headers["Content-Encoding"] = contentEncoding;
			}

			this.config.logger.debug("Sending batch", {
				url,
				eventCount: events.length,
				compressed: !!contentEncoding,
			});

			const response = await fetch(url, {
				method: "POST",
				headers,
				body,
				signal: controller.signal,
				// @ts-expect-error - Node.js specific option
				agent: this.agent,
			});

			if (!response.ok) {
				throw await createHttpError(response);
			}

			const data = (await response.json()) as {
				status?: string;
				processed?: number;
				results?: FlushResponse["results"];
				message?: string;
			};

			this.config.logger.debug("Batch response received", {
				status: data.status,
				processed: data.processed,
			});

			if (data.status === "success") {
				return {
					response: {
						success: true,
						processed: data.processed ?? events.length,
						results: data.results,
					},
					compressionResult,
				};
			}

			return {
				response: {
					success: false,
					error: data.message ?? "Unknown error from server",
				},
				compressionResult,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Network request failed";

			this.config.logger.error("Batch request failed", {
				error: errorMessage,
			});

			// Re-throw for retry handling
			throw error;
		} finally {
			clearTimeout(timeoutId);
			this.abortControllers.delete(controller);
		}
	}

	/**
	 * Send a single event to the API
	 */
	async sendSingle(event: BatchEventPayload): Promise<{
		response: FlushResponse;
		compressionResult?: CompressionResult;
	}> {
		const url = `${this.config.apiUrl}/?client_id=${encodeURIComponent(this.config.clientId)}`;
		const jsonPayload = JSON.stringify(event);

		// Handle compression
		let body: Buffer | string = jsonPayload;
		let contentEncoding: string | null = null;
		let compressionResult: CompressionResult | undefined;

		if (this.config.compression !== false) {
			compressionResult = compressPayload(jsonPayload, this.config.compression);
			body = compressionResult.data;
			contentEncoding = compressionResult.encoding;
		}

		// Create abort controller for timeout
		const controller = new AbortController();
		this.abortControllers.add(controller);

		const timeoutId = setTimeout(() => {
			controller.abort();
		}, this.config.timeout);

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};

			if (contentEncoding) {
				headers["Content-Encoding"] = contentEncoding;
			}

			this.config.logger.debug("Sending single event", {
				url,
				name: event.name,
			});

			const response = await fetch(url, {
				method: "POST",
				headers,
				body,
				signal: controller.signal,
				// @ts-expect-error - Node.js specific option
				agent: this.agent,
			});

			if (!response.ok) {
				throw await createHttpError(response);
			}

			const data = (await response.json()) as {
				status?: string;
				eventId?: string;
				message?: string;
			};

			if (data.status === "success") {
				return {
					response: {
						success: true,
						processed: 1,
						results: [
							{
								status: "success",
								eventId: data.eventId,
							},
						],
					},
					compressionResult,
				};
			}

			return {
				response: {
					success: false,
					error: data.message ?? "Unknown error from server",
				},
				compressionResult,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Network request failed";

			this.config.logger.error("Single event request failed", {
				error: errorMessage,
			});

			throw error;
		} finally {
			clearTimeout(timeoutId);
			this.abortControllers.delete(controller);
		}
	}

	/**
	 * Gracefully close the transport
	 */
	async close(): Promise<void> {
		// Abort all pending requests
		for (const controller of this.abortControllers) {
			controller.abort();
		}
		this.abortControllers.clear();

		// Destroy the agent
		this.agent.destroy();
	}
}
