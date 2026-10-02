import { detectClientId } from "../utils";

export interface McpToolCall {
	clientName?: string;
	clientVersion?: string;
	durationMs: number;
	environment?: string;
	error?: string;
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
	websiteId?: string;
}

interface Implementation {
	name?: string;
	version?: string;
}

interface RequestContext {
	http?: { req?: { headers: { get(name: string): string | null } } };
	requestInfo?: { headers: Record<string, string | string[] | undefined> };
	sessionId?: string;
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
const MAX_ERROR_LENGTH = 512;

const senders = new Map<string, ReturnType<typeof createSender>>();
const instrumented = new WeakSet<McpProtocol>();

function createSender(endpoint: string, apiKey: string, debug: boolean) {
	const pending: McpToolCall[] = [];
	const inFlight = new Set<Promise<void>>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let hasWarnedRejection = false;

	const warn = (...message: unknown[]) => {
		if (debug) {
			console.warn("[databuddy]", ...message);
		}
	};

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
				.catch((error: unknown) => warn("MCP calls not sent:", error))
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

function flushOnExit() {
	if (
		senders.size === 0 &&
		typeof process !== "undefined" &&
		typeof process.on === "function"
	) {
		process.on("beforeExit", () => {
			flushMcp().catch(() => undefined);
		});
	}
}

function senderFor(apiKey: string, options: TrackMcpOptions) {
	const endpoint = `${options.apiUrl ?? "https://basket.databuddy.cc"}/mcp`;
	const key = `${endpoint} ${apiKey}`;
	flushOnExit();
	const sender =
		senders.get(key) ?? createSender(endpoint, apiKey, options.debug ?? false);
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

function errorMessage(outcome: Outcome): string | undefined {
	if ("error" in outcome) {
		const { error } = outcome;
		return error instanceof Error ? error.message : String(error);
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
	const content =
		"content" in result && Array.isArray(result.content) ? result.content : [];
	const text = content.find(
		(part): part is { text: string } =>
			typeof part === "object" &&
			part !== null &&
			"text" in part &&
			typeof part.text === "string"
	);
	return text?.text ?? "";
}

function textLength(result: unknown): number {
	if (
		typeof result !== "object" ||
		result === null ||
		!("content" in result) ||
		!Array.isArray(result.content)
	) {
		return 0;
	}
	let total = 0;
	for (const part of result.content) {
		if (typeof part?.text === "string") {
			total += part.text.length;
		}
	}
	return total;
}

export function trackMcp<T extends object>(
	server: T,
	options: TrackMcpOptions = {}
): T {
	const protocol =
		"server" in server && isProtocol(server.server) ? server.server : server;
	if (!isProtocol(protocol) || instrumented.has(protocol)) {
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
			const client = protocol.getClientVersion?.();
			const userAgent = context?.requestInfo?.headers["user-agent"];
			const call: McpToolCall = {
				tool:
					typeof request.params?.name === "string" ? request.params.name : "",
				durationMs: Math.round(performance.now() - startedAt),
				error: errorMessage(outcome)?.slice(0, MAX_ERROR_LENGTH),
				outputChars: "result" in outcome ? textLength(outcome.result) : 0,
				clientName: client?.name,
				clientVersion: client?.version,
				serverName: protocol._serverInfo?.name,
				serverVersion: protocol._serverInfo?.version,
				sessionId: context?.sessionId,
				userAgent:
					context?.http?.req?.headers.get("user-agent") ??
					(typeof userAgent === "string" ? userAgent : undefined),
				timestamp: Date.now(),
				environment,
				websiteId,
			};
			const kept = options.beforeSend ? options.beforeSend(call) : call;
			if (kept) {
				sender.add(kept);
			}
		} catch {
			return;
		}
	};

	const tracked =
		(handler: RequestHandler): RequestHandler =>
		async (request, context) => {
			const startedAt = performance.now();
			const outcome: Outcome = await Promise.resolve()
				.then(() => handler(request, context))
				.then(
					(result) => ({ result }),
					(error: unknown) => ({ error })
				);
			record(request, context, outcome, startedAt);
			if ("error" in outcome) {
				throw outcome.error;
			}
			return outcome.result;
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
