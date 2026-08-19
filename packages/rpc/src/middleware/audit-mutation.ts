import { log } from "evlog";
import { auditActions } from "@databuddy/shared/audit";
import { appendAuditEvent } from "@databuddy/services/audit";
import { getAuditActor, getAuditRequestContext } from "../lib/audit";
import type { Context } from "../orpc";

const MUTATION_METHOD_PREFIXES = [
	"accept",
	"add",
	"apply",
	"archive",
	"cancel",
	"change",
	"clear",
	"configure",
	"connect",
	"create",
	"delete",
	"disconnect",
	"edit",
	"generate",
	"install",
	"mark",
	"manual",
	"pause",
	"publish",
	"redeem",
	"remove",
	"rename",
	"regenerate",
	"reorder",
	"reset",
	"reply",
	"resolve",
	"restore",
	"resume",
	"revoke",
	"rotate",
	"run",
	"set",
	"submit",
	"test",
	"toggle",
	"transfer",
	"uninstall",
	"unpublish",
	"update",
	"upsert",
] as const;

const EXPLICIT_AUDIT_ROUTERS = new Set(["apikeys", "websites"]);

export function isAuditedMutationPath(path: string): boolean {
	const [router, method] = path.split(".");
	if (!(router && method) || EXPLICIT_AUDIT_ROUTERS.has(router)) {
		return false;
	}

	return MUTATION_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix));
}

function getErrorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return;
	}

	const code = (error as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

function getAuditOutcome(error: unknown): "denied" | "failure" {
	const code = getErrorCode(error);
	return code === "FORBIDDEN" ? "denied" : "failure";
}

async function writeMutationAudit(
	context: Context,
	path: string,
	outcome: "denied" | "failure" | "success",
	error?: unknown
): Promise<void> {
	const organizationId = context.organizationId;
	if (!(organizationId && (context.user || context.apiKey))) {
		return;
	}

	const errorCode = error ? getErrorCode(error) : undefined;
	try {
		await appendAuditEvent(context.db, organizationId, {
			action: auditActions.RPC_MUTATION,
			actor: getAuditActor(context),
			metadata: errorCode ? { errorCode } : undefined,
			operation: path,
			outcome,
			reason: errorCode,
			request: getAuditRequestContext(context),
			source: "orpc",
			target: { id: organizationId },
		});
	} catch (auditError) {
		log.error({
			service: "rpc",
			component: "audit_mutation",
			audit_error: auditError,
			operation: path,
			outcome,
		});
	}
}

export async function runAuditedMutation<T>(
	path: string,
	context: Context,
	fn: () => PromiseLike<T> | T
): Promise<T> {
	if (!isAuditedMutationPath(path)) {
		return await fn();
	}

	try {
		const result = await fn();
		await writeMutationAudit(context, path, "success");
		return result;
	} catch (error) {
		await writeMutationAudit(context, path, getAuditOutcome(error), error);
		throw error;
	}
}
