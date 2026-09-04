import type {
	AuditActionDefinition,
	AuditActor,
	AuditRequestContext,
} from "@databuddy/shared/audit";
import { getClientIp } from "@databuddy/shared/utils/client-ip";
import {
	appendAuditEvent,
	appendAuditEventInTransaction,
	type AuditDatabase,
	type AppendAuditEventInput,
} from "@databuddy/services/audit";
import { log } from "evlog";
import type { Context } from "../orpc";

export function getAuditActor(context: Context): AuditActor {
	if (context.user) {
		return {
			type: "user",
			id: context.user.id,
			displayName: context.user.name || undefined,
		};
	}

	if (context.apiKey) {
		return {
			type: "api",
			id: context.apiKey.id,
			displayName: context.apiKey.name,
		};
	}

	throw new Error(
		"Cannot create an audit event without an authenticated actor"
	);
}

export function getAuditRequestContext(context: Context): AuditRequestContext {
	return {
		ip: getClientIp(context.headers),
		requestId:
			context.requestId ?? context.headers.get("x-request-id") ?? undefined,
		userAgent: context.headers.get("user-agent") ?? undefined,
	};
}

export function getAuditOrganizationId(context: Context): string | null {
	return context.auditOrganizationId ?? context.organizationId;
}

export function setAuditOrganization(context: Context, organizationId: string) {
	context.auditOrganizationId = organizationId;
}

export async function appendRpcAuditEvent<
	TAction extends AuditActionDefinition,
>(
	context: Context,
	organizationId: string,
	input: Omit<AppendAuditEventInput<TAction>, "actor" | "request" | "source">,
	database: AuditDatabase = context.db
): Promise<void> {
	await appendAuditEventInTransaction(database, organizationId, {
		...input,
		actor: getAuditActor(context),
		request: getAuditRequestContext(context),
		source: "orpc",
	});
}

export async function appendRpcAuditEventBestEffort<
	TAction extends AuditActionDefinition,
>(
	context: Context,
	organizationId: string,
	input: Omit<AppendAuditEventInput<TAction>, "actor" | "request" | "source">
): Promise<void> {
	try {
		await appendAuditEvent(context.db, organizationId, {
			...input,
			actor: getAuditActor(context),
			request: getAuditRequestContext(context),
			source: "orpc",
		});
	} catch (error) {
		log.error({
			service: "rpc",
			component: "audit",
			audit_error: error,
			operation: input.operation,
		});
	}
}
