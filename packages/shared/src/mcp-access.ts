import { z } from "zod";

export const MCP_GRANT_CLAIM = "https://databuddy.cc/mcp/grant";

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
		const result = referenceSchema.safeParse(JSON.parse(reference));
		return result.success
			? {
					organizationId: result.data.organizationId,
					websiteIds: result.data.websiteIds,
				}
			: null;
	} catch {
		return null; // Legacy and malformed grants require fresh consent.
	}
}
