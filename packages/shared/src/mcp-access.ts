import { z } from "zod";
import type { ApiScope } from "./api-scopes";

export const MCP_GRANT_CLAIM = "https://databuddy.cc/mcp/grant";

export const MCP_API_SCOPES = [
	"read:data",
	"manage:websites",
	"manage:flags",
	"read:links",
	"write:links",
] as const satisfies readonly ApiScope[];

export type McpApiScope = (typeof MCP_API_SCOPES)[number];

const LINK_SCOPE_DESCRIPTION =
	"Applies to every short link in this organization, including when you choose specific websites.";
export const MCP_PERMISSIONS: Record<
	McpApiScope,
	{ label: string; description: string }
> = {
	"read:data": {
		label: "Read data",
		description:
			"Analytics, insights, investigations, goals, funnels, annotations, and feature flags.",
	},
	"manage:websites": {
		label: "Manage goals, funnels, and annotations",
		description: "Also lets the app reply to investigations.",
	},
	"manage:flags": {
		label: "Manage flags",
		description: "Create and update feature flags.",
	},
	"read:links": {
		label: "Read short links",
		description: LINK_SCOPE_DESCRIPTION,
	},
	"write:links": {
		label: "Create, edit, and delete short links",
		description: LINK_SCOPE_DESCRIPTION,
	},
};

export const mcpAccessGrantSchema = z
	.object({
		organizationId: z.string().min(1).max(200),
		websiteIds: z.array(z.string().min(1).max(200)).min(1).max(1000).nullable(),
	})
	.strict();

export type McpAccessGrant = z.infer<typeof mcpAccessGrantSchema>;

const referenceSchema = mcpAccessGrantSchema.extend({
	version: z.literal(1),
	grantId: z.uuid(),
});

export function encodeMcpGrantReference(
	grant: McpAccessGrant,
	grantId: string
): string {
	return JSON.stringify({
		version: 1,
		grantId,
		organizationId: grant.organizationId,
		websiteIds: grant.websiteIds ? [...new Set(grant.websiteIds)].sort() : null,
	});
}

export function decodeMcpGrantReference(
	reference: string
): McpAccessGrant | null {
	try {
		const { organizationId, websiteIds } = referenceSchema.parse(
			JSON.parse(reference)
		);
		return { organizationId, websiteIds };
	} catch {
		return null; // Legacy and malformed grants require fresh consent.
	}
}
