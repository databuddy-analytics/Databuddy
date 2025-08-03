/**
 * Website Authentication Hook for Analytics
 *
 * This hook provides authentication for website tracking by validating
 * client IDs and origins against registered websites.
 */

import { and, db, eq, member, websites } from '@databuddy/db';
import { cacheable } from '@databuddy/redis';
import { logger } from '../lib/logger';

type Website = typeof websites.$inferSelect;

type WebsiteWithOwner = Website & {
	ownerId: string | null;
};

const REGEX_WWW_PREFIX = /^www\./;
const REGEX_DOMAIN_LABEL = /^[a-zA-Z0-9-]+$/;

/**
 * Resolves the owner's user ID for a given website.
 * The owner is the user if it's a personal project, or the organization's owner
 * if it's an organizational project.
 * @param website The website object.
 * @returns A promise that resolves to the owner's user ID or null if not found.
 */
async function _resolveOwnerId(website: Website): Promise<string | null> {
	if (website.userId) {
		return website.userId;
	}

	if (website.organizationId) {
		try {
			const orgMember = await db.query.member.findFirst({
				where: and(
					eq(member.organizationId, website.organizationId),
					eq(member.role, 'owner')
				),
				columns: {
					userId: true,
				},
			});

			if (orgMember) {
				return orgMember.userId;
			}

			logger.warn('Organization owner not found for website', {
				websiteId: website.id,
				organizationId: website.organizationId,
			});
		} catch (error) {
			logger.error('Failed to fetch organization owner', {
				websiteId: website.id,
				organizationId: website.organizationId,
				error,
			});
		}
	}

	logger.warn('No owner could be determined for website', {
		websiteId: website.id,
	});
	return null;
}

const getOwnerId = cacheable(
	async (website: Website): Promise<string | null> => {
		return await _resolveOwnerId(website);
	},
	{
		expireInSec: 300,
		prefix: 'website_owner_id',
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

// Cache the website lookup and owner lookup
export const getWebsiteById = cacheable(
	async (id: string): Promise<WebsiteWithOwner | null> => {
		const website = await db.query.websites.findFirst({
			where: eq(websites.id, id),
		});

		if (!website) {
			return null;
		}

		const ownerId = await getOwnerId(website);

		return { ...website, ownerId };
	},
	{
		expireInSec: 300,
		prefix: 'website_with_owner_by_id',
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

/**
 * Validates if an origin header matches or is a subdomain of the allowed domain
 *
 * @param originHeader - The Origin header value from the request
 * @param allowedDomain - The domain to validate against (can include protocol, port, www prefix)
 * @returns true if origin is valid, false otherwise
 *
 * @example
 * isValidOrigin('https://app.example.com', 'example.com') // true
 * isValidOrigin('https://example.com', 'https://www.example.com:3000') // true
 * isValidOrigin('https://malicious.com', 'example.com') // false
 * isValidOrigin('http://localhost:3000', 'localhost') // true
 */
export function isValidOrigin(
	originHeader: string,
	allowedDomain: string
): boolean {
	if (!originHeader?.trim()) {
		return true;
	}
	if (!allowedDomain?.trim()) {
		logger.warn('[isValidOrigin] No allowed domain provided');
		return false;
	}
	try {
		const normalizedAllowedDomain = normalizeDomain(allowedDomain);
		const originUrl = new URL(originHeader.trim());
		const normalizedOriginDomain = normalizeDomain(originUrl.hostname);

		// Exact match or subdomain match
		return (
			normalizedOriginDomain === normalizedAllowedDomain ||
			isSubdomain(normalizedOriginDomain, normalizedAllowedDomain)
		);
	} catch (error) {
		logger.error(
			new Error(
				`[isValidOrigin] Validation failed: ${error instanceof Error ? error.message : String(error)}`
			)
		);
		return false;
	}
}

/**
 * Normalizes a domain by removing the protocol, port, and "www." prefix.
 * This ensures a consistent format for comparison.
 * @param domain - Domain string to normalize.
 * @returns Normalized domain string.
 * @throws {Error} if the domain format is invalid.
 */
export function normalizeDomain(domain: string): string {
	if (!domain) {
		return '';
	}
	let urlString = domain.toLowerCase().trim();

	// Ensure there's a protocol for the URL constructor to work correctly.
	if (!urlString.includes('://')) {
		urlString = `https://${urlString}`;
	}

	try {
		const hostname = new URL(urlString).hostname;
		const finalDomain = hostname.replace(REGEX_WWW_PREFIX, '');

		if (!isValidDomainFormat(finalDomain)) {
			throw new Error(
				`Invalid domain format after normalization: ${finalDomain}`
			);
		}
		return finalDomain;
	} catch (error) {
		logger.error(`Failed to parse domain: ${domain}`, { error });
		throw new Error(`Invalid domain format: ${domain}`);
	}
}

/**
 * Checks if originDomain is a subdomain of allowedDomain.
 * @param originDomain - The origin domain to check (e.g., "blog.example.com").
 * @param allowedDomain - The allowed parent domain (e.g., "example.com").
 * @returns `true` if originDomain is a subdomain of allowedDomain.
 */
export function isSubdomain(
	originDomain: string,
	allowedDomain: string
): boolean {
	return (
		originDomain.endsWith(`.${allowedDomain}`) &&
		originDomain.length > allowedDomain.length + 1
	);
}

/**
 * Performs a basic validation of the domain format.
 * @param domain - Domain to validate.
 * @returns `true` if the domain format appears to be valid.
 */
export function isValidDomainFormat(domain: string): boolean {
	if (
		!domain ||
		domain.length > 253 ||
		domain.startsWith('.') ||
		domain.endsWith('.') ||
		domain.includes('..')
	) {
		return false;
	}

	const labels = domain.split('.');
	for (const label of labels) {
		if (label.length < 1 || label.length > 63) {
			return false;
		}
		if (
			!REGEX_DOMAIN_LABEL.test(label) ||
			label.startsWith('-') ||
			label.endsWith('-')
		) {
			return false;
		}
	}

	return true;
}

// Enhanced version with additional security features
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

		// HTTPS requirement check
		if (requireHttps && originUrl.protocol !== 'https:') {
			return false;
		}

		// Localhost handling
		if (isLocalhost(originUrl.hostname)) {
			return allowLocalhost;
		}

		// Specific subdomain checks
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

		// Main domain check
		const normalizedAllowedDomain = normalizeDomain(allowedDomain);
		return (
			normalizedOriginDomain === normalizedAllowedDomain ||
			isSubdomain(normalizedOriginDomain, normalizedAllowedDomain)
		);
	} catch (error) {
		logger.error(
			new Error(
				`[isValidOriginSecure] Validation failed: ${error instanceof Error ? error.message : String(error)}`
			)
		);
		return false;
	}
}

/**
 * Checks if a hostname is a localhost or a private network address.
 * @param hostname - The hostname to check.
 * @returns `true` if the hostname is considered localhost.
 */
export function isLocalhost(hostname: string): boolean {
	return (
		hostname === 'localhost' || // "localhost"
		hostname === '[::1]' || // IPv6 loopback
		hostname.startsWith('127.')
	); // IPv4 loopback
}

const getWebsiteByIdCached = cacheable(
	async (id: string): Promise<Website | null> => {
		const website = await db.query.websites.findFirst({
			where: eq(websites.id, id),
		});
		return website ?? null;
	},
	{
		expireInSec: 300, // 5 minutes
		prefix: 'website_by_id',
		staleWhileRevalidate: true,
		staleTime: 60, // 1 minute
	}
);

const getOwnerIdCached = cacheable(
	async (website: Website): Promise<string | null> => {
		return await _resolveOwnerId(website);
	},
	{
		expireInSec: 300,
		prefix: 'website_owner_id',
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

export async function getWebsiteByIdV2(
	id: string
): Promise<WebsiteWithOwner | null> {
	const website = await getWebsiteByIdCached(id);
	if (!website) {
		return null;
	}

	const ownerId = await getOwnerIdCached(website);
	return { ...website, ownerId };
}
