import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ApiKeyRow } from "../../lib/api-key";
import { trackAgentEvent } from "../../lib/databuddy";
import { captureError, mergeWideEvent } from "../../lib/tracing";
import {
	ensureWebsiteAccess,
	resolveWebsiteId,
	type WebsiteSelectorInput,
} from "./tool-context";

const MAX_DESCRIPTION_LEN = 240;
const TOOL_NAME_RE = /^[a-z][a-z0-9_]*$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI CSI match
const ANSI_RE = /\u001B\[[0-?]*[ -/]*[@-~]/g;

function stripAnsi(text: string): string {
	return text.replace(ANSI_RE, "");
}

function coerceMcpInput(input: unknown): unknown {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return input;
	}
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed === "true") {
				out[key] = true;
				continue;
			}
			if (trimmed === "false") {
				out[key] = false;
				continue;
			}
			if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
				try {
					const parsed = JSON.parse(trimmed);
					if (typeof parsed === "object" && parsed !== null) {
						out[key] = parsed;
						continue;
					}
				} catch {
					// intentionally empty
				}
			}
		}
		out[key] = value;
	}
	return out;
}

export type McpErrorCode =
	| "invalid_input"
	| "unauthorized"
	| "not_found"
	| "rate_limited"
	| "upstream_timeout"
	| "internal";

export class McpToolError extends Error {
	readonly code: McpErrorCode;
	readonly hint?: string;
	readonly details?: Record<string, unknown>;

	constructor(
		code: McpErrorCode,
		message: string,
		opts?: { hint?: string; details?: Record<string, unknown> }
	) {
		super(message);
		this.name = "McpToolError";
		this.code = code;
		this.hint = opts?.hint;
		this.details = opts?.details;
	}
}

export interface McpRequestContext {
	apiKey: ApiKeyRow | null;
	requestHeaders: Headers;
	userId: string | null;
}

export interface McpHandlerContext extends McpRequestContext {
	websiteDomain?: string;
	websiteId?: string;
}

export interface McpToolMeta<S extends z.ZodTypeAny = z.ZodTypeAny> {
	description: string;
	inputSchema: S;
	name: string;
	/**
	 * Optional Zod schema describing the successful response shape.
	 * When set, the MCP SDK validates handler output against it and exposes
	 * it as `structuredContent` (MCP 2025-06-18 Tool Output Schemas), letting
	 * clients consume native typed data instead of parsing JSON text.
	 * The schema MUST validate an object — per MCP spec, `structuredContent`
	 * is an object. Prefer `z.object({...})` or `z.record(...)`.
	 */
	outputSchema?: z.ZodType<Record<string, unknown>>;
	ratelimit?: { limit: number; windowSec: number };
	/**
	 * Whether the wrapper should resolve and validate a websiteId from the input.
	 * - true: required; throw not_found if no selector provided
	 * - "optional": resolve only if a selector is present
	 * - false / undefined: skip
	 */
	resolveWebsite?: boolean | "optional";
}

export type McpToolHandler<I> = (
	input: I,
	ctx: McpHandlerContext
) => Promise<unknown> | unknown;

export interface RegisteredMcpTool {
	description: string;
	handler: (rawInput: unknown) => Promise<CallToolResult>;
	inputSchema: z.ZodTypeAny;
	name: string;
	outputSchema?: z.ZodTypeAny;
}

export interface McpToolFactory {
	readonly build: (ctx: McpRequestContext) => RegisteredMcpTool;
	readonly toolName: string;
}

function toErrorResult(err: McpToolError): CallToolResult {
	const errorPayload: Record<string, unknown> = {
		code: err.code,
		message: stripAnsi(err.message),
	};
	if (err.hint) {
		errorPayload.hint = stripAnsi(err.hint);
	}
	if (err.details) {
		errorPayload.details = err.details;
	}
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({ error: errorPayload }),
			},
		],
		isError: true,
	};
}

function toSuccessResult(
	data: unknown,
	withStructured: boolean
): CallToolResult {
	const content = [
		{
			type: "text" as const,
			text: JSON.stringify(data),
		},
	];
	// structuredContent must be an object (not array / primitive) per MCP spec.
	if (
		withStructured &&
		data !== null &&
		typeof data === "object" &&
		!Array.isArray(data)
	) {
		return {
			content,
			structuredContent: data as Record<string, unknown>,
			isError: false,
		};
	}
	return { content, isError: false };
}

function getAttribution(ctx: McpRequestContext): {
	organization_id: string | null;
	user_id: string | null;
	auth_type: "session" | "api_key";
} {
	return {
		organization_id: ctx.apiKey?.organizationId ?? null,
		user_id: ctx.userId ?? ctx.apiKey?.userId ?? null,
		auth_type: ctx.apiKey ? "api_key" : "session",
	};
}

function rateLimitIdentifier(ctx: McpRequestContext, toolName: string): string {
	const apiKeyId = (ctx.apiKey as { id?: string } | null)?.id;
	const principal = apiKeyId ?? ctx.userId ?? "anon";
	return `mcp:tool:${toolName}:${principal}`;
}

export function defineMcpTool<S extends z.ZodTypeAny>(
	meta: McpToolMeta<S>,
	handler: McpToolHandler<z.infer<S>>
): McpToolFactory {
	if (!TOOL_NAME_RE.test(meta.name)) {
		throw new Error(`MCP tool name must be snake_case: ${meta.name}`);
	}
	if (meta.description.length > MAX_DESCRIPTION_LEN) {
		throw new Error(
			`MCP tool ${meta.name}: description ${meta.description.length} > ${MAX_DESCRIPTION_LEN} chars`
		);
	}

	const hasOutputSchema = meta.outputSchema !== undefined;
	const coercedInputSchema = z.preprocess(
		coerceMcpInput,
		meta.inputSchema
	) as unknown as S;

	const build = (ctx: McpRequestContext): RegisteredMcpTool => ({
		name: meta.name,
		description: meta.description,
		inputSchema: coercedInputSchema,
		outputSchema: meta.outputSchema,
		handler: async (rawInput: unknown): Promise<CallToolResult> => {
			const start = Date.now();
			const attribution = getAttribution(ctx);

			mergeWideEvent({
				mcp_tool: meta.name,
				mcp_auth_type: attribution.auth_type,
			});

			try {
				const parseResult = coercedInputSchema.safeParse(rawInput ?? {});
				if (!parseResult.success) {
					const issue = parseResult.error.issues[0];
					const path = issue?.path.join(".") ?? "input";
					throw new McpToolError(
						"invalid_input",
						issue ? `${path}: ${issue.message}` : "Invalid input",
						{ details: { issues: parseResult.error.issues } }
					);
				}
				const input = parseResult.data;

				const handlerCtx: McpHandlerContext = { ...ctx };
				if (meta.resolveWebsite) {
					const inputObj = input as WebsiteSelectorInput;
					const optional = meta.resolveWebsite === "optional";
					const hasSelector = Boolean(
						inputObj.websiteId || inputObj.websiteName || inputObj.websiteDomain
					);
					if (!optional || hasSelector) {
						const resolvedId = await resolveWebsiteId(inputObj, ctx);
						if (resolvedId instanceof Error) {
							throw new McpToolError("not_found", resolvedId.message);
						}
						const access = await ensureWebsiteAccess(
							resolvedId,
							ctx.requestHeaders,
							ctx.apiKey
						);
						if (access instanceof Error) {
							throw new McpToolError("unauthorized", access.message);
						}
						handlerCtx.websiteId = resolvedId;
						handlerCtx.websiteDomain = access.domain;
						mergeWideEvent({ mcp_website_id: resolvedId });
					}
				}

				if (meta.ratelimit) {
					const id = rateLimitIdentifier(ctx, meta.name);
					const result = await ratelimit(
						id,
						meta.ratelimit.limit,
						meta.ratelimit.windowSec
					);
					if (!result.success) {
						const headers = getRateLimitHeaders(result);
						const retryAfter = headers["Retry-After"] ?? "60";
						mergeWideEvent({ mcp_rate_limited: true });
						throw new McpToolError(
							"rate_limited",
							`Rate limit exceeded for ${meta.name}. Try again in ${retryAfter}s.`,
							{
								hint: `Limit: ${meta.ratelimit.limit} requests per ${meta.ratelimit.windowSec}s`,
								details: { retryAfter },
							}
						);
					}
				}

				const result = await handler(input, handlerCtx);

				trackAgentEvent("agent_activity", {
					action: "tool_completed",
					source: "mcp",
					tool: meta.name,
					success: true,
					...attribution,
				});
				mergeWideEvent({
					mcp_status: "ok",
					mcp_duration_ms: Date.now() - start,
				});

				return toSuccessResult(result, hasOutputSchema);
			} catch (err) {
				const isToolError = err instanceof McpToolError;
				const toolError = isToolError
					? err
					: new McpToolError(
							"internal",
							err instanceof Error ? err.message : "Unexpected error"
						);

				if (!isToolError) {
					captureError(err, { mcp_tool: meta.name });
				}

				trackAgentEvent("agent_activity", {
					action: "tool_completed",
					source: "mcp",
					tool: meta.name,
					success: false,
					...attribution,
				});
				mergeWideEvent({
					mcp_status: "error",
					mcp_error_code: toolError.code,
					mcp_duration_ms: Date.now() - start,
				});

				return toErrorResult(toolError);
			}
		},
	});
	return { toolName: meta.name, build };
}
