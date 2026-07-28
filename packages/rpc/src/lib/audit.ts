import type {
	AuditActionDefinition,
	AuditActor,
	AuditRequestContext,
} from "@databuddy/shared/audit";
import {
	appendAuditEvent,
	type AppendAuditEventInput,
} from "@databuddy/services/audit";
import type { Context } from "../orpc";

function firstForwardedIp(value: string | null): string | undefined {
	return value?.split(",")[0]?.trim() || undefined;
}

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
		requestId: context.headers.get("x-request-id") ?? undefined,
		ip:
			firstForwardedIp(context.headers.get("x-forwarded-for")) ??
			context.headers.get("x-real-ip") ??
			undefined,
		userAgent: context.headers.get("user-agent") ?? undefined,
	};
}

export async function appendRpcAuditEvent<
	TAction extends AuditActionDefinition,
>(
	context: Context,
	organizationId: string,
	input: Omit<AppendAuditEventInput<TAction>, "actor" | "request" | "source">
): Promise<void> {
	await appendAuditEvent(context.db, organizationId, {
		...input,
		actor: getAuditActor(context),
		request: getAuditRequestContext(context),
		source: "orpc",
	});
}
