import { rpcError } from "../errors";
import type { Context } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

export type LinkPermission = "read" | "create" | "update" | "delete";

export function requireOrganizationId(
	organizationId: string | null | undefined
): string {
	if (!organizationId) {
		throw rpcError.badRequest("Select an organization and try again.");
	}
	return organizationId;
}

export function requireLinkAccess(
	context: Context,
	organizationId: string,
	permission: LinkPermission
) {
	const permissions: [LinkPermission] = [permission];
	return withWorkspace(context, {
		organizationId,
		resource: "link",
		permissions,
	});
}
