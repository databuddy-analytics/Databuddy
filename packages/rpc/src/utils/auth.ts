import { websitesApi } from "@databuddy/auth";
import { db, dbConnections, eq, websites } from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import { logger } from "@databuddy/shared/utils/discord-webhook";
import { TRPCError } from "@trpc/server";
import type { Context } from "../trpc";

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
				"Error fetching website by ID:",
				error instanceof Error ? error.message : String(error),
				{ id }
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

const getDbConnectionById = async (id: string) => {
	try {
		if (!id) {
			return null;
		}
		return await db.query.dbConnections.findFirst({
			where: eq(dbConnections.id, id),
		});
	} catch (error) {
		logger.error(
			"Error fetching database connection by ID:",
			error instanceof Error ? error.message : String(error),
			{ id }
		);
		return null;
	}
};

/**
 * A utility to centralize authorization checks for websites.
 * It verifies if a user has the required permissions for a specific website,
 * checking for ownership or organization roles.
 *
 * @throws {TRPCError} if the user is not authorized.
 */
export async function authorizeWebsiteAccess(
	ctx: Context,
	websiteId: string,
	permission: Permission
) {
	const website = await getWebsiteById(websiteId);

	if (!website) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Website not found." });
	}

	if (permission === "read" && website.isPublic) {
		return website;
	}

	if (!ctx.user) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication is required for this action.",
		});
	}

	if (ctx.user.role === "ADMIN") {
		return website;
	}

	if (website.organizationId) {
		const { success } = await websitesApi.hasPermission({
			headers: ctx.headers,
			body: { permissions: { website: [permission] } },
		});
		if (!success) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "You do not have permission to perform this action.",
			});
		}
	} else if (website.userId !== ctx.user.id) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You are not the owner of this website.",
		});
	}

	return website;
}

/**
 * A utility to centralize authorization checks for database connections.
 * It verifies if a user has the required permissions for a specific database connection,
 * checking for ownership or organization roles.
 *
 * @throws {TRPCError} if the user is not authorized.
 */
export async function authorizeDbConnectionAccess(
	ctx: Context,
	connectionId: string,
	permission: Permission
) {
	const connection = await getDbConnectionById(connectionId);

	if (!connection) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Database connection not found.",
		});
	}

	if (!ctx.user) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication is required for this action.",
		});
	}

	if (ctx.user.role === "ADMIN") {
		return connection;
	}

	if (connection.organizationId) {
		const { success } = await websitesApi.hasPermission({
			headers: ctx.headers,
			body: { permissions: { website: [permission] } },
		});
		if (!success) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "You do not have permission to perform this action.",
			});
		}
	} else if (connection.userId !== ctx.user.id) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You are not the owner of this database connection.",
		});
	}

	return connection;
}
