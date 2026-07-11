export function safeCallbackPath(
	callback: string | null | undefined,
	fallback = "/websites"
): string {
	if (
		typeof callback === "string" &&
		callback.startsWith("/") &&
		!callback.startsWith("//") &&
		!callback.includes("\\")
	) {
		return callback;
	}
	return fallback;
}
