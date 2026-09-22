import {
	apiKeyScopeTargetForResource,
	requiredScopesForResource,
	type ApiKeyScopeTarget,
} from "@databuddy/api-keys/scopes";
import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import type { ApiScope } from "@databuddy/shared/api-scopes";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
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
	organizationId?: string | null;
	requestHeaders: Headers;
	userId: string | null;
}

export interface McpHandlerContext extends McpRequestContext {
	websiteDomain?: string;
	websiteId?: string;
}

type McpToolMutationKind = "read" | "write";

interface McpToolAccess {
	globalScopes: ApiScope[];
	kind: McpToolMutationKind;
	scopes: ApiScope[];
}

interface McpToolAccessInput {
	kind?: McpToolMutationKind;
	scopes?: ApiScope[];
	scopeTarget?: ApiKeyScopeTarget;
}

export interface McpToolMetadata {
	access: McpToolAccess;
}

export interface McpToolMetadataInput {
	access?: McpToolAccessInput;
}
export function metadataForResource(
	resource: string,
	permissions: readonly string[]
): McpToolMetadataInput {
	return {
		access: {
			kind: permissions.every(
				(permission) => permission === "read" || permission === "view_analytics"
			)
				? "read"
				: "write",
			scopeTarget: apiKeyScopeTargetForResource(resource),
			scopes: requiredScopesForResource(resource, permissions),
		},
	};
}

export interface McpToolMeta<S extends z.ZodTypeAny = z.ZodTypeAny> {
	description: string;
	inputSchema: S;
	metadata?: McpToolMetadataInput;
	name: string;
	outputSchema?: z.ZodType<Record<string, unknown>>;
	ratelimit?: { limit: number; windowSec: number };
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
	metadata: McpToolMetadata;
	name: string;
	outputSchema?: z.ZodTypeAny;
}

export interface McpToolFactory {
	readonly build: (ctx: McpRequestContext) => RegisteredMcpTool;
}

function toErrorResult(err: McpToolError): CallToolResult {
	const isInternal = err.code === "internal";
	const errorPayload: Record<string, unknown> = {
		code: err.code,
		message: isInternal
			? "An internal error occurred. Please try again."
			: stripAnsi(err.message),
	};
	if (!isInternal && err.hint) {
		errorPayload.hint = stripAnsi(err.hint);
	}
	if (!isInternal && err.details) {
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

function fromORPCError(error: ORPCError<string, unknown>): McpToolError {
	switch (error.code) {
		case "UNAUTHORIZED":
		case "FORBIDDEN":
			return new McpToolError("unauthorized", error.message);
		case "NOT_FOUND":
			return new McpToolError("not_found", error.message);
		case "BAD_REQUEST":
		case "CONFLICT":
		case "FEATURE_UNAVAILABLE":
		case "PLAN_LIMIT_EXCEEDED":
			return new McpToolError("invalid_input", error.message);
		case "RATE_LIMITED":
			return new McpToolError("rate_limited", error.message);
		default:
			return new McpToolError("internal", error.message);
	}
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
		organization_id: ctx.organizationId ?? ctx.apiKey?.organizationId ?? null,
		user_id: ctx.userId ?? ctx.apiKey?.userId ?? null,
		auth_type: ctx.apiKey ? "api_key" : "session",
	};
}

function rateLimitIdentifier(ctx: McpRequestContext, toolName: string): string {
	const principal = ctx.apiKey?.id ?? ctx.userId ?? "anon";
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

	const metadata = normalizeToolMetadata(
		meta.metadata,
		Boolean(meta.resolveWebsite)
	);
	const hasOutputSchema = meta.outputSchema !== undefined;

	const build = (ctx: McpRequestContext): RegisteredMcpTool => ({
		name: meta.name,
		description: meta.description,
		inputSchema: meta.inputSchema,
		metadata,
		outputSchema: meta.outputSchema,
		handler: async (rawInput: unknown): Promise<CallToolResult> => {
			const start = Date.now();
			const attribution = getAttribution(ctx);

			mergeWideEvent({
				mcp_tool: meta.name,
				mcp_auth_type: attribution.auth_type,
			});

			try {
				const parseResult = meta.inputSchema.safeParse(rawInput ?? {});
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

				trackMcpToolEvent(metadata, meta.name, true, attribution);
				mergeWideEvent({
					mcp_status: "ok",
					mcp_duration_ms: Date.now() - start,
				});

				return toSuccessResult(result, hasOutputSchema);
			} catch (err) {
				const toolError =
					err instanceof McpToolError
						? err
						: err instanceof ORPCError
							? fromORPCError(err)
							: new McpToolError(
									"internal",
									err instanceof Error ? err.message : "Unexpected error"
								);

				if (toolError.code === "internal") {
					captureError(err, { mcp_tool: meta.name });
				}

				trackMcpToolEvent(metadata, meta.name, false, attribution);
				mergeWideEvent({
					mcp_status: "error",
					mcp_error_code: toolError.code,
					mcp_duration_ms: Date.now() - start,
				});

				return toErrorResult(toolError);
			}
		},
	});
	return { build };
}

function normalizeToolMetadata(
	metadata: McpToolMetadataInput | undefined,
	resolvesWebsite: boolean
): McpToolMetadata {
	const configuredScopes = metadata?.access?.scopes ?? [];
	const scopes: ApiScope[] = [
		...(resolvesWebsite ? (["read:data"] as const) : []),
		...configuredScopes,
	];
	return {
		access: {
			globalScopes:
				metadata?.access?.scopeTarget === "global" ? configuredScopes : [],
			kind: metadata?.access?.kind ?? "read",
			scopes: [...new Set(scopes)],
		},
	};
}

function trackMcpToolEvent(
	metadata: McpToolMetadata,
	tool: string,
	success: boolean,
	attribution: ReturnType<typeof getAttribution>
): void {
	const kind = metadata.access.kind;
	trackAgentEvent("agent_activity", {
		action: kind === "write" ? "tool_mutation" : "tool_completed",
		source: "mcp",
		tool,
		success,
		tool_access_kind: kind,
		tool_capability: kind === "write" ? "workspace" : "analytics",
		...attribution,
	});
}
