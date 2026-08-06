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
}
