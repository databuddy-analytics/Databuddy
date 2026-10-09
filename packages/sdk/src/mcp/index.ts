import { detectClientId } from "../utils";

export interface McpToolCall {
	clientName?: string;
	clientVersion?: string;
	durationMs: number;
	environment?: string;
	error?: string;
	errorCode?: string;
	outputChars: number;
	serverName?: string;
	serverVersion?: string;
	sessionId?: string;
	timestamp: number;
	tool: string;
	userAgent?: string;
	websiteId?: string;
}

export interface TrackMcpOptions {
	apiKey?: string;
	apiUrl?: string;
	beforeSend?: (call: McpToolCall) => McpToolCall | null;
	debug?: boolean;
	environment?: string;
	waitUntil?: (promise: Promise<unknown>) => void;
	websiteId?: string;
}

interface Implementation {
	name?: string;
	version?: string;
}

interface RequestContext {
	http?: { req?: { headers: { get(name: string): string | null } } };
	mcpReq?: {
		envelope?: { "io.modelcontextprotocol/clientInfo"?: Implementation };
		signal?: AbortSignal;
	};
	requestInfo?: { headers: Record<string, string | string[] | undefined> };
	sessionId?: string;
	signal?: AbortSignal;
}

type RequestHandler = (
	request: { params?: { name?: unknown } },
	context?: RequestContext
) => unknown;

interface McpProtocol {
	_requestHandlers: Map<string, RequestHandler>;
	_serverInfo?: Implementation;
	getClientVersion?: () => Implementation | undefined;
}

type Outcome = { result: unknown } | { error: unknown };

const BATCH_SIZE = 100;
const FLUSH_DELAY_MS = 1000;

const senders = new Map<string, ReturnType<typeof createSender>>();
const instrumented = new WeakSet<McpProtocol>();

function createSender(endpoint: string, apiKey: string, debug: boolean) {
	const pending: McpToolCall[] = [];
	const inFlight = new Set<Promise<void>>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let hasWarnedRejection = false;

	const send = () => {
		clearTimeout(timer);
		timer = undefined;
		while (pending.length > 0) {
			const calls = pending.splice(0, BATCH_SIZE);
			const request: Promise<void> = fetch(endpoint, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(calls),
				signal: AbortSignal.timeout(5000),
			})
				.then(async (response) => {
					if (!response.ok && (debug || !hasWarnedRejection)) {
						hasWarnedRejection = true;
						console.warn(
							`[databuddy] MCP calls rejected (${response.status}):`,
							await response.text()
						);
					}
				})
				.catch((error: unknown) => {
					if (debug) {
						console.warn("[databuddy] MCP calls not sent:", error);
					}
				})
				.finally(() => inFlight.delete(request));
			inFlight.add(request);
		}
	};

	return {
		add(call: McpToolCall) {
			pending.push(call);
			if (pending.length >= BATCH_SIZE) {
				send();
			} else if (!timer) {
				timer = setTimeout(send, FLUSH_DELAY_MS);
				timer.unref?.();
			}
		},
		async flush() {
			send();
			await Promise.all(inFlight);
		},
	};
}

function senderFor(apiKey: string, options: TrackMcpOptions) {
	const endpoint = `${options.apiUrl ?? "https://basket.databuddy.cc"}/mcp`;
	const key = `${endpoint} ${apiKey}`;
	const existing = senders.get(key);
	if (existing) {
		return existing;
	}
	if (
		senders.size === 0 &&
		typeof process !== "undefined" &&
		typeof process.on === "function"
	) {
		process.on("beforeExit", () => {
			flushMcp().catch(() => undefined);
		});
	}
	const sender = createSender(endpoint, apiKey, options.debug ?? false);
	senders.set(key, sender);
	return sender;
}

function isProtocol(value: unknown): value is McpProtocol {
	return (
		typeof value === "object" &&
		value !== null &&
		"_requestHandlers" in value &&
		value._requestHandlers instanceof Map
	);
}

function cap(value: unknown, maxLength: number): string | undefined {
	return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

function texts(result: unknown): string[] {
	if (
		typeof result !== "object" ||
		result === null ||
		!("content" in result) ||
		!Array.isArray(result.content)
	) {
		return [];
	}
	return result.content.flatMap((part) =>
		typeof part?.text === "string" ? [part.text] : []
	);
}

function thrownCode(error: Error): string | undefined {
	const code =
		Object.hasOwn(error, "code") && "code" in error ? error.code : undefined;
	if (typeof code === "number" || (typeof code === "string" && code)) {
		return String(code);
	}
	return error.name === "Error" ? undefined : error.name;
}

function failure(
	outcome: Outcome
): { code?: string; message: string } | undefined {
	if ("error" in outcome) {
		const { error } = outcome;
		return error instanceof Error
			? { code: thrownCode(error), message: error.message }
			: { message: String(error) };
	}
	const { result } = outcome;
	if (
		typeof result !== "object" ||
		result === null ||
		!("isError" in result) ||
		result.isError !== true
	) {
		return;
	}
	return { message: texts(result)[0] ?? "" };
}

function isUnfinished(outcome: Outcome): boolean {
	if ("error" in outcome) {
		return (
			outcome.error instanceof Error &&
			"code" in outcome.error &&
			outcome.error.code === -32_042
		);
	}
	const { result } = outcome;
	if (typeof result !== "object" || result === null) {
		return false;
	}
	if (
		"resultType" in result &&
		typeof result.resultType === "string" &&
		result.resultType !== "complete"
	) {
		return true;
	}
	return (
		!("content" in result) &&
		"task" in result &&
		typeof result.task === "object" &&
		result.task !== null &&
		"taskId" in result.task &&
		typeof result.task.taskId === "string"
	);
}

export function trackMcp<T extends object>(
	server: T,
	options: TrackMcpOptions = {}
): T {
	const protocol =
		"server" in server && isProtocol(server.server) ? server.server : server;
	if (!isProtocol(protocol)) {
		if (options.debug) {
			console.warn(
				"[databuddy] trackMcp needs an McpServer or Server from the MCP SDK; MCP calls are not tracked"
			);
		}
		return server;
	}
	if (instrumented.has(protocol)) {
		return server;
	}
	const env = typeof process === "undefined" ? {} : process.env;
	const apiKey = options.apiKey ?? env.DATABUDDY_API_KEY;
	if (!apiKey) {
		if (options.debug) {
			console.warn(
				"[databuddy] trackMcp needs an API key (DATABUDDY_API_KEY); MCP calls are not tracked"
			);
		}
		return server;
	}
	const sender = senderFor(apiKey, options);
	const websiteId =
		options.websiteId ||
		detectClientId() ||
		env.DATABUDDY_WEBSITE_ID ||
		undefined;
	const environment = options.environment ?? env.VERCEL_ENV ?? env.NODE_ENV;
	instrumented.add(protocol);

	const record = (
		request: Parameters<RequestHandler>[0],
		context: RequestContext | undefined,
		outcome: Outcome,
		startedAt: number
	) => {
		try {
			if (isUnfinished(outcome)) {
				return;
			}
			const cancelled =
				(context?.signal ?? context?.mcpReq?.signal)?.aborted === true;
			const failed = cancelled
				? { code: "cancelled", message: "Cancelled by the client" }
				: failure(outcome);
			const client =
				protocol.getClientVersion?.() ??
				context?.mcpReq?.envelope?.["io.modelcontextprotocol/clientInfo"];
			const call: McpToolCall = {
				tool: cap(request.params?.name, 256) ?? "",
				durationMs: Math.round(performance.now() - startedAt),
				error: cap(failed?.message, 4096),
				errorCode: cap(failed?.code, 64),
				outputChars:
					"result" in outcome && !cancelled
						? texts(outcome.result).reduce(
								(total, text) => total + text.length,
								0
							)
						: 0,
				clientName: cap(client?.name, 128),
				clientVersion: cap(client?.version, 64),
				serverName: cap(protocol._serverInfo?.name, 128),
				serverVersion: cap(protocol._serverInfo?.version, 64),
				sessionId: cap(context?.sessionId, 128),
				userAgent: cap(
					context?.http?.req?.headers.get("user-agent") ??
						context?.requestInfo?.headers["user-agent"],
					512
				),
				timestamp: Date.now(),
				environment,
				websiteId,
			};
			const kept = options.beforeSend ? options.beforeSend(call) : call;
			if (kept) {
				sender.add(kept);
				options.waitUntil?.(sender.flush());
			}
		} catch (error) {
			if (options.debug) {
				console.warn("[databuddy] MCP call tracking failed:", error);
			}
		}
	};

	const tracked =
		(handler: RequestHandler): RequestHandler =>
		async (request, context) => {
			const startedAt = performance.now();
			try {
				const result = await handler(request, context);
				record(request, context, { result }, startedAt);
				return result;
			} catch (error) {
				record(request, context, { error }, startedAt);
				throw error;
			}
		};

	const handlers = protocol._requestHandlers;
	const setHandler = handlers.set.bind(handlers);
	const existing = handlers.get("tools/call");
	if (existing) {
		setHandler("tools/call", tracked(existing));
	}
	handlers.set = (method, handler) =>
		setHandler(method, method === "tools/call" ? tracked(handler) : handler);
	return server;
}

export async function flushMcp(): Promise<void> {
	await Promise.all([...senders.values()].map((sender) => sender.flush()));
}
