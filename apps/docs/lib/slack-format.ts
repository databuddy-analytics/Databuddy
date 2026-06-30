export function escapeMrkdwn(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\|/g, "&#124;");
}

export function safeUrlForSlack(url: string): string {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return "";
		}
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return "";
	}
}

export function mrkdwnLink(url: string, label: string): string {
	const safe = safeUrlForSlack(url);
	const text = escapeMrkdwn(label);
	return safe ? `<${safe}|${text}>` : text;
}
