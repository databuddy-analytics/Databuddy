import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Permission statement defining all resources and their actions.
 * This is the single source of truth for all permission types.
 */
export const statement = {
	...defaultStatements,

	website: [
		"create",
		"read",
		"update",
		"delete",
		"configure",
		"view_analytics",
		"manage_tracking",
		"transfer",
	],

	organization: ["read", "update", "manage_logo", "manage_settings", "delete"],

	subscription: ["read", "update", "cancel", "manage_billing", "view_usage"],

	invitation: ["create", "cancel"],

	// Add new resources here - they'll be automatically available in withWorkspace
	link: ["create", "read", "update", "delete", "view_analytics"],

	llm: ["read", "view_analytics", "manage"],
} as const;

/**
 * Type helpers for permission checking.
 */
export type PermissionStatement = typeof statement;
export type ResourceType = keyof PermissionStatement;
export type PermissionFor<R extends ResourceType> =
	PermissionStatement[R][number];

const ac = createAccessControl(statement);

const viewer = ac.newRole({
	website: ["read", "view_analytics"],
	organization: ["read"],
	subscription: ["read"],
	link: ["read", "view_analytics"],
	llm: ["read", "view_analytics"],
});

const member = ac.newRole({
	website: ["read", "configure", "view_analytics", "manage_tracking"],
	subscription: ["read", "view_usage"],
	organization: ["read"],
	member: memberAc.statements.member,
	invitation: memberAc.statements.invitation,
	link: ["read", "view_analytics"],
	llm: ["read", "view_analytics"],
});

const admin = ac.newRole({
	website: [
		"create",
		"read",
		"update",
		"delete",
		"configure",
		"view_analytics",
		"manage_tracking",
		"transfer",
	],
	subscription: ["read", "view_usage"],
	organization: ["read", "update", "manage_logo"],
	member: adminAc.statements.member,
	invitation: adminAc.statements.invitation,
	link: ["create", "read", "update", "delete", "view_analytics"],
	llm: ["read", "view_analytics", "manage"],
});

const owner = ac.newRole({
	website: [
		"create",
		"read",
		"update",
		"delete",
		"configure",
		"view_analytics",
		"manage_tracking",
		"transfer",
	],
	subscription: ["read", "update", "cancel", "manage_billing", "view_usage"],
	organization: ["read", "update", "manage_logo", "manage_settings", "delete"],
	member: ownerAc.statements.member,
	invitation: ownerAc.statements.invitation,
	link: ["create", "read", "update", "delete", "view_analytics"],
	llm: ["read", "view_analytics", "manage"],
});

export { ac, owner, admin, member, viewer };
