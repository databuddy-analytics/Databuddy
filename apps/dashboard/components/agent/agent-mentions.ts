import type { Website } from "@/hooks/use-websites";

const MENTION_RE = /(^|\s)@([^\s@]*)$/;
const MAX_MENTION_RESULTS = 8;

export function getMentionQuery(text: string): string | null {
	const match = text.match(MENTION_RE);
	return match ? (match[2] ?? "") : null;
}

export function stripMentionQuery(text: string): string {
	return text.replace(MENTION_RE, (_full, lead) => lead);
}

export function filterMentionWebsites(
	websites: Website[],
	query: string,
	excludeIds: ReadonlySet<string>
): Website[] {
	const normalized = query.toLowerCase().trim();
	return websites
		.filter((website) => !excludeIds.has(website.id))
		.filter((website) => {
			if (!normalized) {
				return true;
			}
			return (
				(website.name ?? "").toLowerCase().includes(normalized) ||
				(website.domain ?? "").toLowerCase().includes(normalized)
			);
		})
		.slice(0, MAX_MENTION_RESULTS);
}
