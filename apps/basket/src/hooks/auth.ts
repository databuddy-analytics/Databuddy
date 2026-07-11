/**
 * Website Authentication Hook for Analytics
 *
 * This hook provides authentication for website tracking by validating
 * client IDs and origins against registered websites.
 */

import { db } from "@databuddy/db";
import type { Website } from "@databuddy/db/schema";
import { cacheNamespaces } from "@databuddy/redis/cache-invalidation";
import { cacheable } from "@databuddy/redis/cacheable";
import { basketErrors } from "@lib/structured-errors";
import { captureError, record } from "@lib/tracing";
import { isValidOriginFromSettings } from "@utils/origin-ip-validation";
import { createError, EvlogError } from "evlog";

export {
	isValidIpFromSettings,
	isValidOriginFromSettings,
} from "@utils/origin-ip-validation";

type WebsiteWithOwner = Website & {
	ownerId: string | null;
};

const REGEX_WWW_PREFIX = /^www\./;
const REGEX_DOMAIN_LABEL = /^[a-zA-Z0-9-]+$/;

function _resolveOwnerId(
	organizationId: string | null
): Promise<string | null> {
	return record("resolveOwnerId", async () => {
		if (!organizationId) {
			return null;
		}

		try {
			const orgMember = await db.query.member.findFirst({
				where: { organizationId, role: "owner" },
				columns: {
					userId: true,
				},
			});

			if (orgMember) {
				return orgMember.userId;
			}
		} catch (error) {
			if (error instanceof EvlogError) {
				throw error;
			}
			captureError(error, {
				message: "Failed to fetch workspace owner",
				organizationId,
			});
			throw basketErrors.websiteLookupUnavailable();
		}

		return null;
	});
}

export const resolveApiKeyOwnerId = cacheable(
	async (organizationId: string | null): Promise<string | null> =>
		_resolveOwnerId(organizationId),
	{
		expireInSec: 300,
		prefix: cacheNamespaces.apiKeyOwnerId,
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
	const trimmedOrigin = originHeader?.trim();
	if (!trimmedOrigin) {
		return true;
	}
	if (trimmedOrigin === "null") {
		return false;
	}
	if (!allowedDomain?.trim()) {
		return false;
	}
	try {
		const normalizedAllowedDomain = normalizeDomain(allowedDomain);
		const originUrl = new URL(trimmedOrigin);
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
				code: "basket.INVALID_DOMAIN",
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
			code: "basket.INVALID_DOMAIN",
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

const getWebsiteByIdWithOwnerCached = cacheable(
	async (id: string): Promise<WebsiteWithOwner | null> => {
		try {
			const website = await db.query.websites.findFirst({
				where: { id },
			});

			if (!website) {
				return null;
			}

			const ownerId = await _resolveOwnerId(website.organizationId);
			return { ...website, ownerId };
		} catch (error) {
			if (error instanceof EvlogError) {
				throw error;
			}
			captureError(error, {
				message: "Failed to get website by ID from cache",
				websiteId: id,
			});
			throw basketErrors.websiteLookupUnavailable();
		}
	},
	{
		expireInSec: 600,
		prefix: cacheNamespaces.websiteWithOwner,
		staleWhileRevalidate: true,
		staleTime: 120,
		queryTimeoutMs: 10_000,
	}
);

export function isOriginAllowed(
	origin: string,
	websiteDomain: string,
	allowedOrigins?: string[]
): boolean {
	if (isValidOrigin(origin, websiteDomain)) {
		return true;
	}
	if (allowedOrigins?.length) {
		return isValidOriginFromSettings(origin, allowedOrigins);
	}
	return false;
}

export function getWebsiteByIdV2(id: string): Promise<WebsiteWithOwner | null> {
	return record("getWebsiteByIdV2", async () => {
		try {
			return await getWebsiteByIdWithOwnerCached(id);
		} catch (error) {
			if (error instanceof EvlogError) {
				throw error;
			}
			captureError(error, {
				message: "Failed to get website by ID V2",
				websiteId: id,
			});
			throw basketErrors.websiteLookupUnavailable();
		}
	});
}
