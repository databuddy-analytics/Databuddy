/**
 * Website Authentication Hook for Analytics
 *
 * This hook provides authentication for website tracking by validating
 * client IDs and origins against registered websites.
 */

import { and, db, eq, member, type Website, websites } from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import { captureError, record } from "@lib/tracing";
import { createError, EvlogError } from "evlog";

type WebsiteWithOwner = Website & {
	ownerId: string | null;
};

const REGEX_WWW_PREFIX = /^www\./;
const REGEX_DOMAIN_LABEL = /^[a-zA-Z0-9-]+$/;

/**
 * Resolves the billing owner's user ID for a given website.
 * Used exclusively for Autumn billing checks, NOT for ClickHouse owner_id.
 */
function _resolveOwnerId(website: Website): Promise<string | null> {
	return record("resolveOwnerId", async () => {
		if (!website.organizationId) {
			return null;
		}

		try {
			const orgMember = await db.query.member.findFirst({
				where: and(
					eq(member.organizationId, website.organizationId),
					eq(member.role, "owner")
				),
				columns: {
					userId: true,
				},
			});

			if (orgMember) {
				return orgMember.userId;
			}
		} catch (error) {
			captureError(error, {
				message: "Failed to fetch workspace owner",
				websiteId: website.id,
				organizationId: website.organizationId,
			});
		}

		return null;
	});
}

const getOwnerId = cacheable(
	async (website: Website): Promise<string | null> =>
		await _resolveOwnerId(website),
	{
		expireInSec: 300,
		prefix: "website_owner_id",
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

/**
 * Resolves the billing owner's user ID for an API key.
 * Returns the workspace (organization) owner's userId.
 */
function _resolveApiKeyOwnerId(
	organizationId: string | null
): Promise<string | null> {
	return record("resolveApiKeyOwnerId", async () => {
		if (!organizationId) {
			return null;
		}

		try {
			const orgMember = await db.query.member.findFirst({
				where: and(
					eq(member.organizationId, organizationId),
					eq(member.role, "owner")
				),
				columns: {
					userId: true,
				},
			});

			if (orgMember) {
				return orgMember.userId;
			}
		} catch (error) {
			captureError(error, {
				message: "Failed to fetch workspace owner for API key",
				organizationId,
			});
		}

		return null;
	});
}

export const resolveApiKeyOwnerId = cacheable(
	async (organizationId: string | null): Promise<string | null> =>
		_resolveApiKeyOwnerId(organizationId),
	{
		expireInSec: 300,
		prefix: "api_key_owner_id",
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

export const getWebsiteById = cacheable(
	async (id: string): Promise<WebsiteWithOwner | null> => {
		try {
			const website = await db.query.websites.findFirst({
				where: eq(websites.id, id),
			});

			if (!website) {
				return null;
			}

			const ownerId = await getOwnerId(website);

			return { ...website, ownerId };
		} catch (error) {
			captureError(error, {
				message: "Failed to get website by ID",
				websiteId: id,
			});
			return null;
		}
	},
	{
		expireInSec: 300,
		prefix: "website_with_owner_by_id",
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

/**
 * Validates if an origin header matches or is a subdomain of the allowed domain
 */
export function isValidOrigin(
	originHeader: string,
	allowedDomain: string
): boolean {
	if (!originHeader?.trim()) {
		return true;
	}
	if (!allowedDomain?.trim()) {
		return false;
	}
	try {
		const normalizedAllowedDomain = normalizeDomain(allowedDomain);
		const originUrl = new URL(originHeader.trim());
		const normalizedOriginDomain = normalizeDomain(originUrl.hostname);

		return (
			normalizedOriginDomain === normalizedAllowedDomain ||
			isSubdomain(normalizedOriginDomain, normalizedAllowedDomain)
		);
	} catch (error) {
		captureError(error, {
			message: "[isValidOrigin] Validation failed",
			originHeader,
			allowedDomain,
		});
		return false;
	}
}

/**
 * Normalizes a domain by removing the protocol, port, and "www." prefix.
 */
export function normalizeDomain(domain: string): string {
	if (!domain) {
		return "";
	}
	let urlString = domain.toLowerCase().trim();

	if (!urlString.includes("://")) {
		urlString = `https://${urlString}`;
	}

	try {
		const hostname = new URL(urlString).hostname;
		const finalDomain = hostname.replace(REGEX_WWW_PREFIX, "");

		if (!isValidDomainFormat(finalDomain)) {
			throw createError({
				message: `Invalid domain format after normalization: ${finalDomain}`,
				status: 400,
				why: "The domain failed format validation after extracting the hostname.",
				fix: "Use a valid hostname (for example example.com).",
			});
		}
		return finalDomain;
	} catch (error) {
		captureError(error, { message: "Failed to parse domain", domain });
		if (error instanceof EvlogError) {
			throw error;
		}
		const cause = error instanceof Error ? error : new Error(String(error));
		throw createError({
			message: `Invalid domain format: ${domain}`,
			status: 400,
			why: cause.message,
			fix: "Enter a valid domain or URL.",
			cause,
		});
	}
}

export function isSubdomain(
	originDomain: string,
	allowedDomain: string
): boolean {
	return (
		originDomain.endsWith(`.${allowedDomain}`) &&
		originDomain.length > allowedDomain.length + 1
	);
}

export function isValidDomainFormat(domain: string): boolean {
	if (
		!domain ||
		domain.length > 253 ||
		domain.startsWith(".") ||
		domain.endsWith(".") ||
		domain.includes("..")
	) {
		return false;
	}

	const labels = domain.split(".");
	for (const label of labels) {
		if (label.length < 1 || label.length > 63) {
			return false;
		}
		if (
			!REGEX_DOMAIN_LABEL.test(label) ||
			label.startsWith("-") ||
			label.endsWith("-")
		) {
			return false;
		}
	}

	return true;
}

export function isValidOriginSecure(
	originHeader: string,
	allowedDomain: string,
	options: {
		allowLocalhost?: boolean;
		allowedSubdomains?: string[];
		blockedSubdomains?: string[];
		requireHttps?: boolean;
	} = {}
): boolean {
	const {
		allowLocalhost = false,
		allowedSubdomains = [],
		blockedSubdomains = [],
		requireHttps = false,
	} = options;

	if (!originHeader?.trim()) {
		return true;
	}

	if (!allowedDomain?.trim()) {
		return false;
	}

	try {
		const originUrl = new URL(originHeader.trim());

		if (requireHttps && originUrl.protocol !== "https:") {
			return false;
		}

		if (isLocalhost(originUrl.hostname)) {
			return allowLocalhost;
		}

		const normalizedOriginDomain = normalizeDomain(originUrl.hostname);
		if (
			allowedSubdomains.length > 0 &&
			!allowedSubdomains.some(
				(sub) => `${sub}.${allowedDomain}` === normalizedOriginDomain
			)
		) {
			return false;
		}

		if (
			blockedSubdomains.length > 0 &&
			blockedSubdomains.some(
				(sub) => `${sub}.${allowedDomain}` === normalizedOriginDomain
			)
		) {
			return false;
		}

		const normalizedAllowedDomain = normalizeDomain(allowedDomain);
		return (
			normalizedOriginDomain === normalizedAllowedDomain ||
			isSubdomain(normalizedOriginDomain, normalizedAllowedDomain)
		);
	} catch (error) {
		captureError(error, {
			message: "[isValidOriginSecure] Validation failed",
			originHeader,
			allowedDomain,
		});
		return false;
	}
}

export function isLocalhost(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "[::1]" ||
		hostname.startsWith("127.")
	);
}

const getWebsiteByIdWithOwnerCached = cacheable(
	async (id: string): Promise<WebsiteWithOwner | null> => {
		try {
			const website = await db.query.websites.findFirst({
				where: eq(websites.id, id),
			});

			if (!website) {
				return null;
			}

			const ownerId = await _resolveOwnerId(website);
			return { ...website, ownerId };
		} catch (error) {
			captureError(error, {
				message: "Failed to get website by ID from cache",
				websiteId: id,
			});
			return null;
		}
	},
	{
		expireInSec: 600,
		prefix: "website_with_owner_v2",
		staleWhileRevalidate: true,
		staleTime: 120,
	}
);

/**
 * Validates if an origin matches any of the allowed origins from website settings
 */
export function isValidOriginFromSettings(
	originHeader: string,
	allowedOrigins?: string[]
): boolean {
	if (!originHeader?.trim()) {
		return true;
	}

	if (!allowedOrigins || allowedOrigins.length === 0) {
		return true;
	}

	try {
		const originUrl = new URL(originHeader.trim());
		const originDomain = normalizeDomain(originUrl.hostname);

		for (const allowed of allowedOrigins) {
			if (allowed === "*") {
				return true;
			}

			if (allowed === "localhost") {
				if (originDomain === "localhost") {
					return true;
				}
				continue;
			}

			if (allowed.startsWith("*.")) {
				const baseDomain = normalizeDomain(allowed.slice(2));
				if (
					originDomain === baseDomain ||
					isSubdomain(originDomain, baseDomain)
				) {
					return true;
				}
				continue;
			}

			const normalizedAllowed = normalizeDomain(allowed);
			if (originDomain === normalizedAllowed) {
				return true;
			}
		}

		return false;
	} catch (error) {
		captureError(error, {
			message: "[isValidOriginFromSettings] Validation failed",
			originHeader,
			allowedOriginsCount: allowedOrigins?.length ?? 0,
		});
		return false;
	}
}

/**
 * Validates if an IP address matches any of the allowed IPs from website settings
 */
export function isValidIpFromSettings(
	ip: string,
	allowedIps?: string[]
): boolean {
	if (!ip?.trim()) {
		return true;
	}

	if (!allowedIps || allowedIps.length === 0) {
		return true;
	}

	const trimmedIp = ip.trim();

	for (const allowed of allowedIps) {
		if (allowed === trimmedIp) {
			return true;
		}

		if (allowed.includes("/") && isIpInCidrRange(trimmedIp, allowed)) {
			return true;
		}
	}

	return false;
}

function isIpInCidrRange(ip: string, cidr: string): boolean {
	try {
		const [network, prefixLengthStr] = cidr.split("/");
		const prefixLength = Number.parseInt(prefixLengthStr, 10);

		if (Number.isNaN(prefixLength) || prefixLength < 0 || prefixLength > 32) {
			return false;
		}

		const ipToNumber = (ipAddr: string): number => {
			const parts = ipAddr.split(".");
			return (
				Number.parseInt(parts[0] ?? "0", 10) * 16_777_216 +
				Number.parseInt(parts[1] ?? "0", 10) * 65_536 +
				Number.parseInt(parts[2] ?? "0", 10) * 256 +
				Number.parseInt(parts[3] ?? "0", 10)
			);
		};

		const networkNum = ipToNumber(network);
		const ipNum = ipToNumber(ip);
		const maskSize = 2 ** (32 - prefixLength);

		const networkMasked = Math.floor(networkNum / maskSize) * maskSize;
		const ipMasked = Math.floor(ipNum / maskSize) * maskSize;

		return networkMasked === ipMasked;
	} catch {
		return false;
	}
}

export function getWebsiteByIdV2(id: string): Promise<WebsiteWithOwner | null> {
	return record("getWebsiteByIdV2", async () => {
		try {
			return await getWebsiteByIdWithOwnerCached(id);
		} catch (error) {
			captureError(error, {
				message: "Failed to get website by ID V2",
				websiteId: id,
			});
			return null;
		}
	});
}
