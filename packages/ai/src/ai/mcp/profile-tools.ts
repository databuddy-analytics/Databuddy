import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import type { ToolSet } from "ai";
import { z } from "zod";
import { buildProfileTools } from "../tools/profiles";
import { ensureWebsiteAccess } from "./tool-context";

interface McpContextLike {
	apiKey: ApiKeyRow | null;
	requestHeaders: Headers;
}

function getMcpContext(options: unknown): McpContextLike {
	const ctx = (options as { experimental_context?: unknown })
		?.experimental_context;
	if (!ctx || typeof ctx !== "object" || !("requestHeaders" in ctx)) {
		throw new Error("MCP profile tools require McpAgentContext");
	}
	return ctx as McpContextLike;
}

export function createMcpProfileTools(): ToolSet {
	return buildProfileTools({
		loggerName: "MCP Profiles",
		websiteIdSchema: z.string(),
		resolveSite: async (websiteId, options) => {
			if (!websiteId) {
				throw new Error("websiteId is required");
			}
			const ctx = getMcpContext(options);
			const access = await ensureWebsiteAccess(
				websiteId,
				ctx.requestHeaders,
				ctx.apiKey
			);
			if (access instanceof Error) {
				throw access;
			}
			return { websiteId, domain: access.domain };
		},
	});
}
