import { db, eq, websites } from "@databuddy/db";
import type { InferSelectModel } from "drizzle-orm";

export type Website = InferSelectModel<typeof websites>;

export async function getWebsiteById(id: string): Promise<Website | null> {
	try {
		const website = await db.query.websites.findFirst({
			where: eq(websites.id, id),
		});

		return website || null;
	} catch (error) {
		console.error("Failed to get website by ID:", error);
		return null;
	}
}
