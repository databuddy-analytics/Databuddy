import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditActor, AuditRequestContext } from "@databuddy/shared/audit";

export interface AuthAuditContext {
	actor?: AuditActor;
	operation?: string;
	request?: AuditRequestContext;
}

const storage = new AsyncLocalStorage<AuthAuditContext>();

export function getAuthAuditContext(): AuthAuditContext | undefined {
	return storage.getStore();
}

export function runWithAuthAuditContext<T>(
	context: AuthAuditContext,
	callback: () => T
): T {
	return storage.run(context, callback);
}
