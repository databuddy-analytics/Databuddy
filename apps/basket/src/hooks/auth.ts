/**
 * Website Authentication Hook for Analytics
 *
 * This hook provides authentication for website tracking by validating
 * client IDs and origins against registered websites.
 */

import { and, db, eq } from "@databuddy/db";
import { member, type Website, websites } from "@databuddy/db/schema";
import { cacheable } from "@databuddy/redis/cacheable";
import { captureError, record } from "@lib/tracing";
import { createError, EvlogError } from "evlog";

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
				message: "Failed to fetch workspace owner",
				organizationId,
			});
		}

		return null;
	});
}

export const resolveApiKeyOwnerId = cacheable(
	async (organizationId: string | null): Promise<string | null> =>
		_resolveOwnerId(organizationId),
	{
		expireInSec: 300,
		prefix: "api_key_owner_id",
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

const getWebsiteByIdWithOwnerCached = cacheable(
	async (id: string): Promise<WebsiteWithOwner | null> => {
		try {
			const website = await db.query.websites.findFirst({
				where: eq(websites.id, id),
			});

			if (!website) {
				return null;
			}

			const ownerId = await _resolveOwnerId(website.organizationId);
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

export {
	isValidOriginFromSettings,
	isValidIpFromSettings,
} from "@utils/origin-ip-validation";

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
