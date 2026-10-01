import {
	apiKeyScopeTargetForResource,
	requiredScopesForResource,
	type ApiKeyScopeTarget,
} from "@databuddy/api-keys/scopes";
import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import type { ApiScope } from "@databuddy/shared/api-scopes";
import type {
	CallToolResult,
	ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
import { trackAgentEvent } from "../../lib/databuddy";
import { captureError, mergeWideEvent } from "../../lib/tracing";
import { formatValidationIssues } from "../tools/utils/rpc";
import {
	ensureWebsiteAccess,
	type AuthorizedPrincipal,
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
	| "query_failed"
	| "rate_limited"
	| "plan_limit"
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

export interface McpRequestContext extends AuthorizedPrincipal {
	request?: Request;
}

export interface McpHandlerContext extends McpRequestContext {
	abortSignal?: AbortSignal;
	websiteDomain?: string;
	websiteId?: string;
	websiteOrganizationId?: string;
}

type McpToolMutationKind = "read" | "write";

interface McpToolAccess {
	globalScopes: ApiScope[];
	kind: McpToolMutationKind;
	scopes: ApiScope[];
}

interface McpToolAccessInput {
	kind: McpToolMutationKind;
	scopes?: ApiScope[];
	scopeTarget?: ApiKeyScopeTarget;
}

export interface McpToolMetadata {
	access: McpToolAccess;
}

export interface McpToolMetadataInput {
	access: McpToolAccessInput;
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

interface McpToolAnnotationOverrides {
	destructive?: boolean;
	idempotent?: boolean;
}

export interface McpToolMeta<S extends z.ZodTypeAny = z.ZodTypeAny> {
	annotations?: McpToolAnnotationOverrides;
	description: string;
	inputSchema: S;
	metadata: McpToolMetadataInput;
	name: string;
	outputSchema?: z.ZodType<Record<string, unknown>>;
	ratelimit?: { limit: number; windowSec: number };
	resolveWebsite?: boolean | "optional";
	title?: string;
}

export type McpToolHandler<I> = (
	input: I,
	ctx: McpHandlerContext
) => Promise<unknown> | unknown;

interface McpToolCallExtra {
	signal?: AbortSignal;
}

export interface RegisteredMcpTool {
	annotations: ToolAnnotations;
	description: string;
	handler: (
		rawInput: unknown,
		extra?: McpToolCallExtra
	) => Promise<CallToolResult>;
	inputSchema: z.ZodTypeAny;
	metadata: McpToolMetadata;
	name: string;
	outputSchema?: z.ZodTypeAny;
	title: string;
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
				type: "text",
				text: JSON.stringify({ error: errorPayload }),
			},
		],
		isError: true,
	};
}

function errorDetails(data: unknown): Record<string, unknown> | undefined {
	if (!(data && typeof data === "object" && !Array.isArray(data))) {
		return;
	}
	try {
		const json: unknown = JSON.parse(JSON.stringify(data));
		return json && typeof json === "object" && !Array.isArray(json)
			? Object.fromEntries(Object.entries(json))
			: undefined;
	} catch {
		return;
	}
}

function fromORPCError(
	error: ORPCError<string, unknown>,
	idempotent: boolean
): McpToolError {
	const details = errorDetails(error.data);
	switch (error.code) {
		case "UNAUTHORIZED":
		case "FORBIDDEN":
			return new McpToolError("unauthorized", error.message, { details });
		case "NOT_FOUND":
			return new McpToolError("not_found", error.message, { details });
		case "BAD_REQUEST":
		case "CONFLICT":
			return new McpToolError("invalid_input", error.message, { details });
		case "FEATURE_UNAVAILABLE":
		case "PAYMENT_REQUIRED":
		case "PLAN_LIMIT_EXCEEDED":
			return new McpToolError("plan_limit", error.message, { details });
		case "RATE_LIMITED":
		case "TOO_MANY_REQUESTS":
			return new McpToolError("rate_limited", error.message, { details });
		case "SERVICE_UNAVAILABLE":
		case "GATEWAY_TIMEOUT":
		case "TIMEOUT":
			return new McpToolError("upstream_timeout", error.message, {
				details,
				hint: idempotent
					? "Retry the same call shortly."
					: "The change may already have been saved. Check the current state with the matching list or search tool before retrying.",
			});
		default:
			return new McpToolError("internal", error.message);
	}
}

function titleFromName(name: string): string {
	const [head = name, ...rest] = name.split("_");
	return [head.charAt(0).toUpperCase() + head.slice(1), ...rest].join(" ");
}

function toolAnnotations(
	kind: McpToolMutationKind,
	overrides: McpToolAnnotationOverrides = {}
): ToolAnnotations {
	const isRead = kind === "read";
	return {
		readOnlyHint: isRead,
		destructiveHint: isRead ? false : (overrides.destructive ?? true),
		idempotentHint: isRead ? true : (overrides.idempotent ?? false),
		openWorldHint: false,
	};
}

function authType(ctx: McpRequestContext): "session" | "api_key" | "oauth" {
	return ctx.apiKey ? "api_key" : ctx.oauth ? "oauth" : "session";
}

function getAttribution(ctx: McpHandlerContext): {
	organization_id: string | null;
	user_id: string | null;
	auth_type: "session" | "api_key" | "oauth";
} {
	return {
		organization_id:
			ctx.oauth?.grant.organizationId ??
			ctx.organizationId ??
			ctx.websiteOrganizationId ??
			ctx.apiKey?.organizationId ??
			null,
		user_id: ctx.oauth?.user.id ?? ctx.userId ?? ctx.apiKey?.userId ?? null,
		auth_type: authType(ctx),
	};
}

function isPreviewResult(result: unknown): boolean {
	return (
		typeof result === "object" &&
		result !== null &&
		"preview" in result &&
		result.preview === true
	);
}

function callAbortSignal(
	ctx: McpRequestContext,
	extra: McpToolCallExtra | undefined
): AbortSignal | undefined {
	const signals = [extra?.signal, ctx.request?.signal].filter(
		(signal): signal is AbortSignal => signal !== undefined
	);
	return signals.length > 1 ? AbortSignal.any(signals) : signals[0];
}

function rateLimitIdentifier(ctx: McpRequestContext, toolName: string): string {
	const principal =
		ctx.apiKey?.id ?? ctx.oauth?.user.id ?? ctx.userId ?? "anon";
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
	const annotations = toolAnnotations(metadata.access.kind, meta.annotations);
	const title = meta.title ?? titleFromName(meta.name);
	const { outputSchema } = meta;

	const build = (ctx: McpRequestContext): RegisteredMcpTool => ({
		name: meta.name,
		title,
		annotations,
		description: meta.description,
		inputSchema: meta.inputSchema,
		metadata,
		outputSchema,
		handler: async (
			rawInput: unknown,
			extra?: McpToolCallExtra
		): Promise<CallToolResult> => {
			const start = Date.now();
			const handlerCtx: McpHandlerContext = {
				...ctx,
				abortSignal: callAbortSignal(ctx, extra),
			};

			mergeWideEvent({
				mcp_tool: meta.name,
				mcp_auth_type: authType(ctx),
			});

			try {
				const parseResult = meta.inputSchema.safeParse(rawInput ?? {});
				if (!parseResult.success) {
					throw new McpToolError(
						"invalid_input",
						formatValidationIssues(parseResult.error.issues),
						{ details: { issues: parseResult.error.issues } }
					);
				}
				const input = parseResult.data;

				if (meta.ratelimit) {
					const id = rateLimitIdentifier(ctx, meta.name);
					const limited = await ratelimit(
						id,
						meta.ratelimit.limit,
						meta.ratelimit.windowSec
					);
					if (!limited.success) {
						const headers = getRateLimitHeaders(limited);
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

				if (meta.resolveWebsite) {
					const inputObj = input as WebsiteSelectorInput;
					const optional = meta.resolveWebsite === "optional";
					const hasSelector = Boolean(
						inputObj.websiteId || inputObj.websiteName || inputObj.websiteDomain
					);
					if (!optional || hasSelector) {
						const resolvedId = await resolveWebsiteId(inputObj, ctx);
						if (resolvedId instanceof Error) {
							throw new McpToolError(resolvedId.code, resolvedId.message, {
								hint: resolvedId.hint,
							});
						}
						const access = await ensureWebsiteAccess(resolvedId, ctx);
						if (access instanceof Error) {
							throw new McpToolError(access.code, access.message, {
								hint: access.hint,
							});
						}
						handlerCtx.websiteId = resolvedId;
						handlerCtx.websiteDomain = access.domain;
						handlerCtx.websiteOrganizationId =
							access.organizationId ?? undefined;
						mergeWideEvent({ mcp_website_id: resolvedId });
					}
				}

				let result = await handler(input, handlerCtx);
				let structuredContent: Record<string, unknown> | undefined;
				if (outputSchema) {
					const checked = outputSchema.safeParse(result);
					if (!checked.success) {
						throw new McpToolError(
							"internal",
							`${meta.name} output did not match its schema: ${formatValidationIssues(checked.error.issues)}`
						);
					}
					structuredContent = checked.data;
					result = structuredContent;
				}

				trackMcpToolEvent(metadata, meta.name, {
					attribution: getAttribution(handlerCtx),
					preview: isPreviewResult(result),
					success: true,
				});
				mergeWideEvent({
					mcp_status: "ok",
					mcp_duration_ms: Date.now() - start,
				});

				return {
					content: [{ type: "text", text: JSON.stringify(result) }],
					...(structuredContent && { structuredContent }),
					isError: false,
				};
			} catch (err) {
				const toolError =
					err instanceof McpToolError
						? err
						: err instanceof ORPCError
							? fromORPCError(err, annotations.idempotentHint ?? false)
							: new McpToolError(
									"internal",
									err instanceof Error ? err.message : "Unexpected error"
								);

				if (toolError.code === "internal") {
					captureError(err, { mcp_tool: meta.name });
				}

				trackMcpToolEvent(metadata, meta.name, {
					attribution: getAttribution(handlerCtx),
					preview: false,
					success: false,
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
	return { build };
}

function normalizeToolMetadata(
	metadata: McpToolMetadataInput,
	resolvesWebsite: boolean
): McpToolMetadata {
	const configuredScopes = metadata.access.scopes ?? [];
	const scopes: ApiScope[] = [
		...(resolvesWebsite ? (["read:data"] as const) : []),
		...configuredScopes,
	];
	return {
		access: {
			globalScopes:
				metadata.access.scopeTarget === "global" ? configuredScopes : [],
			kind: metadata.access.kind,
			scopes: [...new Set(scopes)],
		},
	};
}

function trackMcpToolEvent(
	metadata: McpToolMetadata,
	tool: string,
	outcome: {
		attribution: ReturnType<typeof getAttribution>;
		preview: boolean;
		success: boolean;
	}
): void {
	const kind = metadata.access.kind;
	const { attribution, preview, success } = outcome;
	trackAgentEvent("agent_activity", {
		action: preview
			? "tool_preview"
			: kind === "write"
				? "tool_mutation"
				: "tool_completed",
		source: "mcp",
		tool,
		success,
		tool_access_kind: kind,
		tool_capability: kind === "write" ? "workspace" : "analytics",
		...attribution,
	});
}
