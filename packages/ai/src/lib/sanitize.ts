const TAG_RE = /<\/?[a-z_][a-z_0-9-]*(?:\s[^>]*)?\s*\/?>/gi;

export function stripHtmlTags(value: string, maxLength?: number): string {
	let cleaned = maxLength ? value.slice(0, maxLength) : value;
	let prev: string;
	do {
		prev = cleaned;
		cleaned = cleaned.replace(TAG_RE, "");
	} while (cleaned !== prev);
	return cleaned;
}
