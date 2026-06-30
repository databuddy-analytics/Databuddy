export const ACTIONABLE_TRACKING_BLOCK_REASONS = [
	"origin_not_authorized",
	"origin_missing",
	"ip_not_authorized",
] as const;

export type ActionableTrackingBlockReason =
	(typeof ACTIONABLE_TRACKING_BLOCK_REASONS)[number];

const ACTIONABLE_REASON_SET = new Set<string>(
	ACTIONABLE_TRACKING_BLOCK_REASONS
);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const TRAILING_DOT_REGEX = /\.$/;

export function isActionableTrackingBlockReason(
	reason: string
): reason is ActionableTrackingBlockReason {
	return ACTIONABLE_REASON_SET.has(reason);
}

export function getTrackingBlockOriginHost(
	origin: string | null
): string | null {
	if (!origin?.trim()) {
		return null;
	}

	try {
		return new URL(origin).hostname
			.toLowerCase()
			.replace(TRAILING_DOT_REGEX, "");
	} catch {
		return origin.trim().toLowerCase().replace(TRAILING_DOT_REGEX, "");
	}
}

function normalizeTrackingDomain(value: string | null): string | null {
	const trimmed = value?.trim().toLowerCase();
	if (!trimmed) {
		return null;
	}

	const withoutWildcard = trimmed.startsWith("*.") ? trimmed.slice(2) : trimmed;
	const urlString = withoutWildcard.includes("://")
		? withoutWildcard
		: `https://${withoutWildcard}`;

	try {
		return new URL(urlString).hostname
			.toLowerCase()
			.replace(TRAILING_DOT_REGEX, "");
	} catch {
		return withoutWildcard.replace(TRAILING_DOT_REGEX, "");
	}
}

function isSubdomain(origin: string, base: string): boolean {
	return origin.endsWith(`.${base}`) && origin.length > base.length + 1;
}

function matchesOriginPattern(
	host: string,
	pattern: string,
	options: { includeApexForWildcard: boolean }
): boolean {
	const trimmed = pattern.trim().toLowerCase();
	if (!trimmed) {
		return false;
	}
	if (trimmed === "*") {
		return true;
	}
	if (trimmed === "localhost" || trimmed.includes("localhost:*")) {
		return host === "localhost";
	}

	const normalized = normalizeTrackingDomain(trimmed);
	if (!normalized) {
		return false;
	}

	if (trimmed.startsWith("*.")) {
		return options.includeApexForWildcard
			? host === normalized || isSubdomain(host, normalized)
			: isSubdomain(host, normalized);
	}

	return host === normalized;
}

export function matchesTrackingBlockAllowedOrigin(
	origin: string | null,
	websiteDomain: string | null,
	allowedOrigins: string[] = []
): boolean {
	const host = normalizeTrackingDomain(getTrackingBlockOriginHost(origin));
	if (!host || host === "null") {
		return false;
	}

	const domain = normalizeTrackingDomain(websiteDomain);
	if (domain && (host === domain || isSubdomain(host, domain))) {
		return true;
	}

	return allowedOrigins.some((pattern) =>
		matchesOriginPattern(host, pattern, { includeApexForWildcard: true })
	);
}

export function matchesTrackingBlockIgnoredOrigin(
	source: string | null,
	patterns: string[] = []
): boolean {
	const host = normalizeTrackingDomain(getTrackingBlockOriginHost(source));
	if (!host) {
		return false;
	}

	return patterns.some((pattern) =>
		matchesOriginPattern(host, pattern, { includeApexForWildcard: false })
	);
}

function isPrivateIpv4(host: string): boolean {
	const parts = host.split(".").map((part) => Number.parseInt(part, 10));
	if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
		return false;
	}

	const [a, b] = parts;
	if (a === 10) {
		return true;
	}
	if (a === 127) {
		return true;
	}
	if (a === 192 && b === 168) {
		return true;
	}
	return a === 172 && b >= 16 && b <= 31;
}

export function isIgnoredTrackingBlockOrigin(origin: string | null): boolean {
	const host = getTrackingBlockOriginHost(origin);
	if (!host) {
		return false;
	}

	return (
		host === "null" ||
		LOCAL_HOSTS.has(host) ||
		host.endsWith(".localhost") ||
		host.endsWith(".local") ||
		host.endsWith(".webcontainer-api.io") ||
		isPrivateIpv4(host)
	);
}
