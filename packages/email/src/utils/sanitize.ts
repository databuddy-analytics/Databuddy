/**
 * Escapes HTML entities in a string to prevent XSS and hyperlink injection
 * in email content. This ensures user-generated content is safely rendered
 * as plain text in emails.
 *
 * @param text - The text to sanitize
 * @returns The sanitized text with HTML entities escaped
 */
export function sanitizeEmailText(text: string): string {
	if (typeof text !== "string") {
		return "";
	}

	// Map of HTML entities that need to be escaped
	const htmlEntityMap: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#x27;",
		"/": "&#x2F;",
	};

	return text.replace(/[&<>"'/]/g, (char) => htmlEntityMap[char] ?? char);
}
