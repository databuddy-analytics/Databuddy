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
	};
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

const JSON_RPC_ERROR_CODES: Record<number, string> = {
	[-32_700]: "parse_error",
	[-32_600]: "invalid_request",
	[-32_601]: "method_not_found",
	[-32_602]: "invalid_params",
	[-32_603]: "internal_error",
	[-32_001]: "request_timeout",
};

const MCP_ERROR_PREFIX = /^MCP error (-?\d+): (.*)$/s;

interface Failure {
	code?: string;
	message: string;
}

function errorCode(value: unknown): string | undefined {
	if (typeof value === "number") {
		return JSON_RPC_ERROR_CODES[value];
	}
	return typeof value === "string" && value ? value : undefined;
}

function parseFailure(text: string, code?: string): Failure {
	const rpc = MCP_ERROR_PREFIX.exec(text);
	if (rpc) {
		return { code: code ?? errorCode(Number(rpc[1])), message: rpc[2] ?? "" };
	}
	if (!text.startsWith("{")) {
		return { code, message: text };
	}
	try {
		const body: unknown = JSON.parse(text);
		const inner =
			typeof body === "object" && body !== null && "error" in body
				? body.error
				: body;
		if (typeof inner === "string") {
			return { code, message: inner };
		}
		if (
			typeof inner === "object" &&
			inner !== null &&
			"message" in inner &&
			typeof inner.message === "string"
		) {
			return {
				code: code ?? ("code" in inner ? errorCode(inner.code) : undefined),
				message: inner.message,
			};
		}
	} catch {
		return { code, message: text };
	}
	return { code, message: text };
}

function failure(outcome: Outcome): Failure | undefined {
	if ("error" in outcome) {
		const { error } = outcome;
		if (!(error instanceof Error)) {
			return parseFailure(String(error));
		}
		const code = "code" in error ? errorCode(error.code) : undefined;
		return parseFailure(
			error.message,
			code ?? (error.name === "Error" ? undefined : error.name)
		);
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
	return parseFailure(texts(result)[0] ?? "");
}

function isUnfinished(result: unknown): boolean {
	if (typeof result !== "object" || result === null) {
		return false;
	}
	if ("resultType" in result && result.resultType === "input_required") {
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
			if ("result" in outcome && isUnfinished(outcome.result)) {
				return;
			}
			const failed = failure(outcome);
			const client =
				protocol.getClientVersion?.() ??
				context?.mcpReq?.envelope?.["io.modelcontextprotocol/clientInfo"];
			const call: McpToolCall = {
				tool: cap(request.params?.name, 256) ?? "",
				durationMs: Math.round(performance.now() - startedAt),
				error: cap(failed?.message, 512),
				errorCode: cap(failed?.code, 64),
				outputChars:
					"result" in outcome
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
