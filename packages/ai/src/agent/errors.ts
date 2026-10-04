import { API_KEY_AUTH_CHALLENGE } from "@databuddy/api-keys/resolve";
import { isBillingUnavailable } from "@databuddy/shared/billing";
import { APICallError, RetryError } from "ai";

const AGENT_ERRORS = {
	auth_required: { status: 401, message: "Authentication required" },
	invalid_api_key: {
		status: 401,
		message: "The API key is invalid, expired, or lacks the read:data scope.",
	},
	workspace_required: {
		status: 400,
		message: "No active organization. Select an organization and try again.",
	},
	invalid_messages: { status: 400, message: "Invalid message format" },
	access_denied: { status: 403, message: "Access denied" },
	rate_limited: {
		status: 429,
		message: "Too many agent requests. Try again shortly.",
	},
	agent_credits_exhausted: {
		status: 402,
		message:
			"You've used your Databunny allowance for this month. Add more usage, upgrade, or wait for the monthly reset.",
	},
	billing_unavailable: {
		status: 503,
		message: "Billing is temporarily unavailable. Please try again shortly.",
	},
	provider_unavailable: {
		status: 503,
		message:
			"The AI provider is temporarily unavailable. Please try again shortly.",
	},
} as const;

export type AgentErrorCode = keyof typeof AGENT_ERRORS;

export class AgentError extends Error {
	readonly code: AgentErrorCode;
	readonly status: number;

	constructor(
		code: AgentErrorCode,
		message: string = AGENT_ERRORS[code].message
	) {
		super(message);
		this.name = "AgentError";
		this.code = code;
		this.status = AGENT_ERRORS[code].status;
	}
}

function classifyAgentError(error: unknown): AgentError | null {
	if (error instanceof AgentError) {
		return error;
	}
	if (isBillingUnavailable(error)) {
		return new AgentError("billing_unavailable");
	}
	if (APICallError.isInstance(error) || RetryError.isInstance(error)) {
		return new AgentError("provider_unavailable");
	}
	return null;
}

export function toAgentErrorResponse(error: unknown): Response {
	const known = classifyAgentError(error);
	const status = known?.status ?? 500;
	const headers = new Headers({ "Content-Type": "application/json" });
	if (status === 401) {
		headers.set("WWW-Authenticate", API_KEY_AUTH_CHALLENGE);
	}
	return new Response(
		JSON.stringify({
			success: false,
			error:
				known?.message ?? "Agent request failed. Please try again shortly.",
			code: known?.code.toUpperCase() ?? "INTERNAL_ERROR",
		}),
		{ status, headers }
	);
}
