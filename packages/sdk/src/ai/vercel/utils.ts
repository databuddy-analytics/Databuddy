const MAX_TEXT_LENGTH = 100_000; // 100k chars per text field

// Regex patterns at top level for performance
const DATA_URL_REGEX = /^data:([^;,]+)/;
const WHITESPACE_REGEX = /\s/;
const BASE64_REGEX = /^[A-Za-z0-9+/=]+$/;

/**
 * Truncate text to max length
 */
export const truncate = (text: string, maxLength = MAX_TEXT_LENGTH): string => {
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]`;
};

/**
 * Redact base64 data URLs to prevent oversized payloads
 */
export const redactBase64DataUrl = (data: string): string => {
	// Check if it's a data URL
	if (data.startsWith("data:")) {
		const match = data.match(DATA_URL_REGEX);
		const mediaType = match?.[1] ?? "unknown";
		return `[${mediaType} data URL redacted]`;
	}
	// Check if it looks like raw base64 (long string without spaces)
	if (
		data.length > 1000 &&
		!WHITESPACE_REGEX.test(data) &&
		BASE64_REGEX.test(data)
	) {
		return `[base64 data redacted - ${data.length} chars]`;
	}
	return data;
};

/**
 * Convert content to string for simple cases
 */
export const toContentString = (content: unknown): string => {
	if (typeof content === "string") {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.map((c) => {
				if (typeof c === "string") {
					return c;
				}
				if (c && typeof c === "object" && "text" in c) {
					return c.text;
				}
				return "";
			})
			.join("");
	}
	return "";
};

/**
 * Generate a simple trace ID
 */
export const generateTraceId = (): string => {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
};
