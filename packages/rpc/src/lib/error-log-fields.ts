export function getErrorLogFields(error: unknown): {
	error_message: string;
	error_stack?: string;
} {
	if (error instanceof Error) {
		return {
			error_message: error.message,
			...(error.stack ? { error_stack: error.stack } : {}),
		};
	}

	return { error_message: String(error) };
}
