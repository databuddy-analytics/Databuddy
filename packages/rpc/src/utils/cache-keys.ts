import { eq, websites } from "@databuddy/db";
import type { Context } from "../orpc";

/**
 * Determines the authentication context segment for cache keys.
 * This ensures that public resources use a shared cache key while
 * private resources use user-specific cache keys.
 *
 * @param context - The ORPC context containing user and database access
 * @param options - Configuration for determining auth context
 * @returns A string representing the auth context: "public", user ID, or "anonymous"
 */
export async function getCacheAuthContext(
	context: Context,
	options: {
		websiteId?: string;
		organizationId?: string;
	}
): Promise<string> {
	const { websiteId, organizationId } = options;

	if (websiteId) {
		const website = await context.db.query.websites.findFirst({
			where: eq(websites.id, websiteId),
			columns: { isPublic: true },
		});

		return website?.isPublic ? "public" : (context.user?.id ?? "anonymous");
	}

	if (organizationId) {
		return context.user?.id ?? "anonymous";
	}

	return context.user?.id ?? "anonymous";
}
