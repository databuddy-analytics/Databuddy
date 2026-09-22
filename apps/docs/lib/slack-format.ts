const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const SLACK_TIMEOUT_MS = 10_000;

export async function postSlackBlocks(blocks: unknown[]): Promise<void> {
	if (!SLACK_WEBHOOK_URL) {
		return;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);

	try {
		const response = await fetch(SLACK_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ blocks }),
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`Slack webhook failed with status ${response.status}`);
		}
	} finally {
		clearTimeout(timeoutId);
	}
}

export function createSlackField(label: string, value: string) {
	return {
		type: "mrkdwn" as const,
		text: `*${label}:*\n${escapeMrkdwn(value)}`,
	};
}

export function escapeMrkdwn(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\|/g, "&#124;");
}

function safeUrlForSlack(url: string): string {
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
