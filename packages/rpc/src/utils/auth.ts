import { websitesApi } from "@databuddy/auth";
import { db, eq, websites } from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import { logger } from "@databuddy/shared/logger";
import { ORPCError } from "@orpc/server";
import type { Context } from "../orpc";

type Permission = "read" | "update" | "delete" | "transfer";

const getWebsiteById = cacheable(
	async (id: string) => {
		try {
			if (!id) {
				return null;
			}
			return await db.query.websites.findFirst({
				where: eq(websites.id, id),
			});
		} catch (error) {
			logger.error(
				{
					error,
					id,
				},
				"Error fetching website by ID"
			);
			return null;
		}
	},
	{
		expireInSec: 600,
		prefix: "website_by_id",
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

/**
 * A utility to centralize authorization checks for websites.
 * It verifies if a user has the required permissions for a specific website,
 * checking for ownership or organization roles.
 *
 * Note: Uses ORPCError directly which is compatible with type-safe errors
 * when error codes match the baseErrors definitions.
 *
 * @throws {ORPCError} NOT_FOUND if website doesn't exist
 * @throws {ORPCError} UNAUTHORIZED if user is not authenticated
 * @throws {ORPCError} FORBIDDEN if user lacks permission
 */
export async function authorizeWebsiteAccess(
	ctx: Context,
	websiteId: string,
	permission: Permission
) {
	const website = await getWebsiteById(websiteId);

	if (!website) {
		throw new ORPCError("NOT_FOUND", {
			message: "Website not found",
			data: { resourceType: "website", resourceId: websiteId },
		});
	}

	if (permission === "read" && website.isPublic) {
		return website;
	}

	if (!ctx.user) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Authentication is required for this action",
		});
	}

	if (ctx.user.role === "ADMIN") {
		return website;
	}

	if (!website.organizationId) {
		throw new ORPCError("FORBIDDEN", {
			message: "Website must belong to a workspace",
		});
	}

	const { success } = await websitesApi.hasPermission({
		headers: ctx.headers,
		body: { permissions: { website: [permission] } },
	});
	if (!success) {
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have permission to perform this action",
		});
	}

	return website;
}

/**
 * Checks if a user has full authorization (not just demo/public access).
 * Returns true only if the user is authenticated and authorized.
 */
export async function isFullyAuthorized(
	ctx: Context,
	websiteId: string
): Promise<boolean> {
	try {
		const website = await getWebsiteById(websiteId);

		if (!website) {
			return false;
		}

		// Public access is not "fully authorized" - it's demo access
		if (!ctx.user) {
			return false;
		}

		// Admin is always fully authorized
		if (ctx.user.role === "ADMIN") {
			return true;
		}

		// Website must belong to a workspace
		if (!website.organizationId) {
			return false;
		}

		// Check organization permissions
		const { success } = await websitesApi.hasPermission({
			headers: ctx.headers,
			body: { permissions: { website: ["read"] } },
		});
		return success;
	} catch {
		return false;
	}
}

/**
 * A utility to authorize uptime schedule access.
 * Checks workspace membership via better-auth permissions.
 *
 * @throws {ORPCError} UNAUTHORIZED if user is not authenticated
 * @throws {ORPCError} FORBIDDEN if user lacks permission
 */
export async function authorizeUptimeScheduleAccess(
	ctx: Context,
	_schedule: { organizationId: string }
) {
	if (!ctx.user) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Authentication is required for this action",
		});
	}

	if (ctx.user.role === "ADMIN") {
		return;
	}

	const { success } = await websitesApi.hasPermission({
		headers: ctx.headers,
		body: { permissions: { website: ["update"] } },
	});

	if (!success) {
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have permission to access this monitor",
		});
	}
}
