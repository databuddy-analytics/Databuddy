const PROTOCOL_RE = /^https?:\/\//;

/** Match MCP domain selectors without changing hostname, port or path semantics. */
export function matchesWebsiteDomain(
	domain: string | null,
	input: string
): boolean {
	return domain?.toLowerCase() === input.toLowerCase().replace(PROTOCOL_RE, "");
}
