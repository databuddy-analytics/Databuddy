export type ApiAuthMethod = "api_key" | "both" | "none" | "session";
export type ApiKeyAuthOutcome =
	| "disabled"
	| "expired"
	| "invalid"
	| "missing"
	| "ok"
	| "revoked";

export interface ApiAuthWideEventFields {
	api_key_attempted_prefix: string;
	api_key_attempted_start: string;
	api_key_id: string;
	api_key_outcome: ApiKeyAuthOutcome;
	api_key_prefix: string;
	api_key_resolved: boolean;
	api_key_scope_count: number;
	api_key_type: string;
	auth_method: ApiAuthMethod;
	organization_id: string;
	user_email: string;
	user_id: string;
	user_role: string;
}

export type RpcProcedureType = "admin" | "protected" | "public" | "website";

export interface RpcWideEventFields {
	rpc_abort_reason: string;
	rpc_client_id: string;
	rpc_error_code: string;
	rpc_error_message: string;
	rpc_procedure: string;
	rpc_procedure_type: RpcProcedureType;
	rpc_request_aborted: boolean;
	rpc_router: string;
	rpc_sdk_name: string;
	rpc_sdk_version: string;
	"timing.auth_ms": number;
}

export interface ErrorLogFields {
	error_cause_message?: string;
	error_message: string;
	error_pg_code?: string;
	error_pg_constraint?: string;
	error_pg_detail?: string;
	error_pg_hint?: string;
	error_pg_table?: string;
	error_stack?: string;
}

const PG_SQLSTATE = /^[\dA-Z]{5}$/;
const MAX_CAUSE_DEPTH = 4;

const PG_DETAIL_FIELDS = [
	["error_pg_constraint", "constraint"],
	["error_pg_detail", "detail"],
	["error_pg_hint", "hint"],
	["error_pg_table", "table"],
] as const satisfies readonly (readonly [keyof ErrorLogFields, string])[];

function findPostgresError(
	error: unknown,
	depth = 0
): Record<string, unknown> | null {
	if (depth > MAX_CAUSE_DEPTH || !error || typeof error !== "object") {
		return null;
	}
	const candidate = error as Record<string, unknown>;
	if (
		typeof candidate.code === "string" &&
		PG_SQLSTATE.test(candidate.code) &&
		typeof candidate.severity === "string"
	) {
		return candidate;
	}
	return findPostgresError(candidate.cause, depth + 1);
}

export function getErrorLogFields(error: unknown): ErrorLogFields {
	if (!(error instanceof Error)) {
		return { error_message: String(error) };
	}

	const fields: ErrorLogFields = { error_message: error.message };
	if (error.stack) {
		fields.error_stack = error.stack;
	}
	if (error.cause instanceof Error) {
		fields.error_cause_message = error.cause.message;
	}

	const pg = findPostgresError(error);
	if (!pg) {
		return fields;
	}

	fields.error_pg_code = pg.code as string;
	for (const [field, key] of PG_DETAIL_FIELDS) {
		const value = pg[key];
		if (typeof value === "string" && value) {
			fields[field] = value;
		}
	}
	return fields;
}
