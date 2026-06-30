export type DatabuddyAgentUserErrorCode = "agent_credits_exhausted";

interface DatabuddyAgentUserErrorOptions {
	code: DatabuddyAgentUserErrorCode;
	message: string;
}

export class DatabuddyAgentUserError extends Error {
	readonly code: DatabuddyAgentUserErrorCode;
	readonly expose = true;

	constructor({ code, message }: DatabuddyAgentUserErrorOptions) {
		super(message);
		this.name = "DatabuddyAgentUserError";
		this.code = code;
	}
}

export function isDatabuddyAgentUserError(
	error: unknown
): error is DatabuddyAgentUserError {
	return (
		error instanceof DatabuddyAgentUserError ||
		(isRecord(error) &&
			error.name === "DatabuddyAgentUserError" &&
			error.expose === true &&
			typeof error.code === "string" &&
			typeof error.message === "string")
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
