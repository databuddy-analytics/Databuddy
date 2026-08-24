import { audit, defineAuditAction } from "evlog";

export const auditActorTypes = ["user", "api", "system", "agent"] as const;
export type AuditActorType = (typeof auditActorTypes)[number];

export const auditOutcomes = ["success", "failure", "denied"] as const;
export type AuditOutcome = (typeof auditOutcomes)[number];

export const auditSources = [
	"orpc",
	"better_auth",
	"public_api",
	"worker",
] as const;
export type AuditSource = (typeof auditSources)[number];

export type AuditValue =
	| boolean
	| null
	| number
	| string
	| (boolean | null | number | string)[];

export type AuditChanges = Record<
	string,
	{ after?: AuditValue; before?: AuditValue }
>;

export type AuditMetadata = Record<string, AuditValue>;

export interface AuditActor {
	displayName?: string;
	id: string;
	type: AuditActorType;
}

export interface AuditRequestContext {
	ip?: string;
	requestId?: string;
	userAgent?: string;
}

function defineAction<
	const TAction extends string,
	const TTarget extends string,
>(action: TAction, targetType: TTarget) {
	return {
		action,
		emit: defineAuditAction(action, { target: targetType }),
		targetType,
	};
}

/**
 * The complete, intentionally small audit vocabulary for the first product
 * surface. Add actions here before instrumenting a new privileged operation.
 */
export const auditActions = {
	AUDIT_LOG_VIEWED: defineAction("audit_log.viewed", "audit_log"),
	AUDIT_LOG_EVENT_VIEWED: defineAction("audit_log.event_viewed", "audit_log"),
	AUDIT_LOG_EXPORTED: defineAction("audit_log.exported", "audit_log"),
	RPC_MUTATION: defineAction("rpc.mutation", "organization"),
	FLAG_CHANGED: defineAction("flag.changed", "flag"),
	API_KEY_CREATED: defineAction("api_key.created", "api_key"),
	API_KEY_UPDATED: defineAction("api_key.updated", "api_key"),
	API_KEY_REVOKED: defineAction("api_key.revoked", "api_key"),
	API_KEY_ROTATED: defineAction("api_key.rotated", "api_key"),
	API_KEY_DELETED: defineAction("api_key.deleted", "api_key"),
	WEBSITE_CREATED: defineAction("website.created", "website"),
	WEBSITE_UPDATED: defineAction("website.updated", "website"),
	WEBSITE_VISIBILITY_CHANGED: defineAction(
		"website.visibility_changed",
		"website"
	),
	WEBSITE_SETTINGS_UPDATED: defineAction("website.settings_updated", "website"),
	WEBSITE_DELETED: defineAction("website.deleted", "website"),
	WEBSITE_TRANSFERRED: defineAction("website.transferred", "website"),
	ORGANIZATION_CREATED: defineAction("organization.created", "organization"),
	ORGANIZATION_UPDATED: defineAction("organization.updated", "organization"),
	ORGANIZATION_DELETED: defineAction("organization.deleted", "organization"),
	ORGANIZATION_MEMBER_ADDED: defineAction(
		"organization.member_added",
		"member"
	),
	ORGANIZATION_MEMBER_REMOVED: defineAction(
		"organization.member_removed",
		"member"
	),
	ORGANIZATION_MEMBER_ROLE_UPDATED: defineAction(
		"organization.member_role_updated",
		"member"
	),
	ORGANIZATION_INVITATION_CREATED: defineAction(
		"organization.invitation_created",
		"invitation"
	),
	ORGANIZATION_INVITATION_ACCEPTED: defineAction(
		"organization.invitation_accepted",
		"invitation"
	),
	ORGANIZATION_INVITATION_REJECTED: defineAction(
		"organization.invitation_rejected",
		"invitation"
	),
	ORGANIZATION_INVITATION_CANCELLED: defineAction(
		"organization.invitation_cancelled",
		"invitation"
	),
} as const;

export type AuditActionDefinition =
	(typeof auditActions)[keyof typeof auditActions];
export type AuditActionName = AuditActionDefinition["action"];

export const auditActionLabels = {
	"api_key.created": "Created API key",
	"api_key.deleted": "Deleted API key",
	"api_key.revoked": "Revoked API key",
	"api_key.rotated": "Rotated API key",
	"api_key.updated": "Updated API key",
	"audit_log.event_viewed": "Viewed audit event",
	"audit_log.exported": "Exported audit log",
	"audit_log.viewed": "Viewed audit log",
	"flag.changed": "Changed feature flag",
	"organization.created": "Created organization",
	"organization.deleted": "Deleted organization",
	"organization.invitation_accepted": "Accepted organization invitation",
	"organization.invitation_cancelled": "Cancelled organization invitation",
	"organization.invitation_created": "Created organization invitation",
	"organization.invitation_rejected": "Rejected organization invitation",
	"organization.member_added": "Added organization member",
	"organization.member_removed": "Removed organization member",
	"organization.member_role_updated": "Updated member role",
	"organization.updated": "Updated organization",
	"rpc.mutation": "System mutation",
	"website.created": "Created website",
	"website.deleted": "Deleted website",
	"website.settings_updated": "Updated website settings",
	"website.transferred": "Transferred website",
	"website.updated": "Updated website",
	"website.visibility_changed": "Changed website visibility",
} satisfies Record<AuditActionName, string>;

export const auditTechnicalActionNames = [
	auditActions.AUDIT_LOG_EVENT_VIEWED.action,
	auditActions.AUDIT_LOG_VIEWED.action,
	auditActions.RPC_MUTATION.action,
] as const;

export const AUDIT_REDACTED_VALUE = "[REDACTED]" as const;

const sensitiveAuditFieldPattern =
	/(^|[_-])(authorization|cookie|key|password|secret|token)([_-]|$)/i;

function isSensitiveAuditField(field: string): boolean {
	const normalizedField = field.replace(
		/[A-Z]/g,
		(character) => `_${character}`
	);
	return sensitiveAuditFieldPattern.test(normalizedField);
}

function redactAuditValue(field: string, value: AuditValue | undefined) {
	if (value === undefined) {
		return;
	}
	return isSensitiveAuditField(field) ? AUDIT_REDACTED_VALUE : value;
}

export function redactAuditChanges(changes?: AuditChanges): AuditChanges {
	return Object.fromEntries(
		Object.entries(changes ?? {}).map(([field, change]) => {
			const before = redactAuditValue(field, change.before);
			const after = redactAuditValue(field, change.after);
			return [
				field,
				{
					...(before === undefined ? {} : { before }),
					...(after === undefined ? {} : { after }),
				},
			];
		})
	);
}

export function redactAuditMetadata(metadata?: AuditMetadata): AuditMetadata {
	return Object.fromEntries(
		Object.entries(metadata ?? {}).map(([field, value]) => [
			field,
			redactAuditValue(field, value),
		])
	) as AuditMetadata;
}

export const auditSourceLabels: Record<AuditSource, string> = {
	better_auth: "Authentication",
	orpc: "Dashboard",
	public_api: "Public API",
	worker: "Background job",
};

export const auditActorTypeLabels: Record<AuditActorType, string> = {
	agent: "Agent",
	api: "API key",
	system: "System",
	user: "User",
};

const auditTargetLabels: Record<string, string> = {
	audit_log: "Audit log",
	api_key: "API key",
	flag: "Feature flag",
	invitation: "Invitation",
	member: "Member",
	organization: "Organization",
	website: "Website",
};

function titleCase(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getAuditActionLabel(action: string): string {
	if (action in auditActionLabels) {
		return auditActionLabels[action as AuditActionName];
	}

	const [resource, verb] = action.split(".");
	return verb
		? `${titleCase(verb)} ${titleCase(resource ?? "event")}`
		: titleCase(action);
}

export function getAuditTargetLabel(targetType: string): string {
	return auditTargetLabels[targetType] ?? titleCase(targetType);
}

export interface AuditMirrorInput<TAction extends AuditActionDefinition> {
	action: TAction;
	actor: AuditActor;
	changes?: AuditChanges;
	correlationId?: string;
	organizationId: string;
	outcome?: AuditOutcome;
	reason?: string;
	target: { id: string };
}

export function emitAuditMirror<TAction extends AuditActionDefinition>(
	input: AuditMirrorInput<TAction>
): void {
	audit({
		...input.action.emit({
			actor: input.actor,
			target: { id: input.target.id, organizationId: input.organizationId },
			outcome: input.outcome,
			reason: input.reason,
		}),
		...(input.changes ? { changes: { after: input.changes } } : {}),
		correlationId: input.correlationId,
	});
}

function asNonEmptyActionList(
	values: AuditActionName[]
): readonly [AuditActionName, ...AuditActionName[]] {
	if (values.length === 0) {
		throw new Error("Audit actions must not be empty");
	}
	return values as [AuditActionName, ...AuditActionName[]];
}

export const auditActionNames = asNonEmptyActionList(
	Object.values(auditActions).map(({ action }) => action)
);
