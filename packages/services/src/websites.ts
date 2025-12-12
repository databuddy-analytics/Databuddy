import { randomUUID } from "node:crypto";
import {
	and,
	db,
	eq,
	type InferInsertModel,
	type InferSelectModel,
	isNull,
	websites,
} from "@databuddy/db";
import { WebsiteCache } from "./website-cache";

export type Website = InferSelectModel<typeof websites>;

export type CreateWebsiteInput = Omit<
	InferInsertModel<typeof websites>,
	"id" | "createdAt" | "updatedAt"
> & {
	id?: string;
};

export type UpdateWebsiteInput = Partial<
	Omit<InferInsertModel<typeof websites>, "id" | "createdAt">
>;

export class WebsiteService {
	private readonly database: typeof db;
	private readonly cache: WebsiteCache | null;

	constructor(
		database: typeof db = db,
		cache: WebsiteCache | null = new WebsiteCache()
	) {
		this.database = database;
		this.cache = cache;
	}

	private async getByIdFromDb(id: string): Promise<Website | null> {
		try {
			const website = await this.database.query.websites.findFirst({
				where: eq(websites.id, id),
			});
			return website ?? null;
		} catch (error) {
			console.error("WebsiteService.getByIdFromDb failed:", {
				error: String(error),
			});
			return null;
		}
	}

	async getById(id: string): Promise<Website | null> {
		const cached = await this.cache?.getWebsiteById(id);
		if (cached) {
			return cached;
		}

		try {
			const website = await this.database.query.websites.findFirst({
				where: eq(websites.id, id),
			});
			if (website) {
				await this.cache?.setWebsite(website);

				if (website.organizationId) {
					await this.cache?.setWebsiteByDomain(
						website.domain,
						{ organizationId: website.organizationId },
						website
					);
				} else if (website.userId) {
					await this.cache?.setWebsiteByDomain(
						website.domain,
						{ userId: website.userId },
						website
					);
				}
			}

			return website ?? null;
		} catch (error) {
			console.error("WebsiteService.getById failed:", { error: String(error) });
			return null;
		}
	}

	async getByDomain(
		domain: string,
		filter?: { userId?: string | null; organizationId?: string | null }
	): Promise<Website | null> {
		try {
			// Cache only when the scope is explicit (prevents collisions between org and personal sites).
			if (filter?.organizationId) {
				const cached = await this.cache?.getWebsiteByDomain(domain, {
					organizationId: filter.organizationId,
				});
				if (cached) {
					return cached;
				}
			} else if (filter?.userId) {
				const cached = await this.cache?.getWebsiteByDomain(domain, {
					userId: filter.userId,
				});
				if (cached) {
					return cached;
				}
			}

			const domainCondition = eq(websites.domain, domain);

			const userCondition =
				filter?.userId === undefined
					? undefined
					: filter.userId === null
						? isNull(websites.userId)
						: eq(websites.userId, filter.userId);

			const organizationCondition =
				filter?.organizationId === undefined
					? undefined
					: filter.organizationId === null
						? isNull(websites.organizationId)
						: eq(websites.organizationId, filter.organizationId);

			if (userCondition && organizationCondition) {
				return (
					(await this.database.query.websites.findFirst({
						where: and(domainCondition, userCondition, organizationCondition),
					})) ?? null
				);
			}

			if (userCondition) {
				return (
					(await this.database.query.websites.findFirst({
						where: and(domainCondition, userCondition),
					})) ?? null
				);
			}

			if (organizationCondition) {
				return (
					(await this.database.query.websites.findFirst({
						where: and(domainCondition, organizationCondition),
					})) ?? null
				);
			}

			const website =
				(await this.database.query.websites.findFirst({
					where: domainCondition,
				})) ?? null;

			if (website) {
				await this.cache?.setWebsite(website);
				if (website.organizationId) {
					await this.cache?.setWebsiteByDomain(
						website.domain,
						{ organizationId: website.organizationId },
						website
					);
				} else if (website.userId) {
					await this.cache?.setWebsiteByDomain(
						website.domain,
						{ userId: website.userId },
						website
					);
				}
			}

			return website;
		} catch (error) {
			console.error("WebsiteService.getByDomain failed:", {
				error: String(error),
			});
			return null;
		}
	}

	async list(filter?: {
		userId?: string | null;
		organizationId?: string | null;
	}): Promise<Website[]> {
		try {
			if (!filter) {
				return await this.database.query.websites.findMany();
			}

			const cacheFilter = {
				userId:
					filter.userId && typeof filter.userId === "string"
						? filter.userId
						: undefined,
				organizationId:
					filter.organizationId && typeof filter.organizationId === "string"
						? filter.organizationId
						: undefined,
			};

			const cached = await this.cache?.getList(cacheFilter);
			if (cached) {
				return cached;
			}

			const userCondition =
				filter.userId === undefined
					? undefined
					: filter.userId === null
						? isNull(websites.userId)
						: eq(websites.userId, filter.userId);

			const organizationCondition =
				filter.organizationId === undefined
					? undefined
					: filter.organizationId === null
						? isNull(websites.organizationId)
						: eq(websites.organizationId, filter.organizationId);

			if (userCondition && organizationCondition) {
				return await this.database.query.websites.findMany({
					where: and(userCondition, organizationCondition),
				});
			}

			if (userCondition) {
				return await this.database.query.websites.findMany({
					where: userCondition,
				});
			}

			if (organizationCondition) {
				const rows = await this.database.query.websites.findMany({
					where: organizationCondition,
				});
				await this.cache?.setList(cacheFilter, rows);
				return rows;
			}

			const rows = await this.database.query.websites.findMany();
			await this.cache?.setList(cacheFilter, rows);
			return rows;
		} catch (error) {
			console.error("WebsiteService.list failed:", { error: String(error) });
			return [];
		}
	}

	async create(input: CreateWebsiteInput): Promise<Website | null> {
		try {
			const [created] = await this.database
				.insert(websites)
				.values({
					...input,
					id: input.id ?? randomUUID(),
					updatedAt: new Date(),
				})
				.returning();

			if (created) {
				await this.cache?.setWebsite(created);

				if (created.organizationId) {
					await this.cache?.setWebsiteByDomain(
						created.domain,
						{ organizationId: created.organizationId },
						created
					);
				} else if (created.userId) {
					await this.cache?.setWebsiteByDomain(
						created.domain,
						{ userId: created.userId },
						created
					);
				}

				await this.cache?.invalidateLists({
					userIds: created.userId ? [created.userId] : [],
					organizationIds: created.organizationId
						? [created.organizationId]
						: [],
					userOrgPairs:
						created.userId && created.organizationId
							? [
									{
										userId: created.userId,
										organizationId: created.organizationId,
									},
								]
							: [],
				});
			}

			return created ?? null;
		} catch (error) {
			console.error("WebsiteService.create failed:", { error: String(error) });
			return null;
		}
	}

	async updateById(
		id: string,
		updates: UpdateWebsiteInput
	): Promise<Website | null> {
		const hasAtLeastOneUpdate = (() => {
			for (const value of Object.values(updates)) {
				if (value !== undefined) {
					return true;
				}
			}
			return false;
		})();

		if (!hasAtLeastOneUpdate) {
			return this.getById(id);
		}

		try {
			const before = await this.getByIdFromDb(id);

			const [updated] = await this.database
				.update(websites)
				.set({ ...updates, updatedAt: new Date() })
				.where(eq(websites.id, id))
				.returning();

			if (updated) {
				await this.cache?.setWebsite(updated);

				if (before) {
					const scopeChanged =
						before.organizationId !== updated.organizationId ||
						before.userId !== updated.userId;
					const domainChanged = before.domain !== updated.domain;

					if (scopeChanged || domainChanged) {
						if (before.organizationId) {
							await this.cache?.deleteWebsiteByDomain(before.domain, {
								organizationId: before.organizationId,
							});
						} else if (before.userId) {
							await this.cache?.deleteWebsiteByDomain(before.domain, {
								userId: before.userId,
							});
						}
					}
				}

				if (updated.organizationId) {
					await this.cache?.setWebsiteByDomain(
						updated.domain,
						{ organizationId: updated.organizationId },
						updated
					);
				} else if (updated.userId) {
					await this.cache?.setWebsiteByDomain(
						updated.domain,
						{ userId: updated.userId },
						updated
					);
				}

				const userIds = Array.from(
					new Set([before?.userId, updated.userId].filter(Boolean) as string[])
				);
				const organizationIds = Array.from(
					new Set(
						[before?.organizationId, updated.organizationId].filter(
							Boolean
						) as string[]
					)
				);

				const userOrgPairs = (() => {
					const pairs: Array<{ userId: string; organizationId: string }> = [];
					if (before?.userId && before.organizationId) {
						pairs.push({
							userId: before.userId,
							organizationId: before.organizationId,
						});
					}
					if (updated.userId && updated.organizationId) {
						pairs.push({
							userId: updated.userId,
							organizationId: updated.organizationId,
						});
					}
					return pairs;
				})();

				await this.cache?.invalidateLists({
					userIds,
					organizationIds,
					userOrgPairs,
				});
			}

			return updated ?? null;
		} catch (error) {
			console.error("WebsiteService.updateById failed:", {
				error: String(error),
			});
			return null;
		}
	}

	async deleteById(id: string): Promise<boolean> {
		try {
			const [deleted] = await this.database
				.delete(websites)
				.where(eq(websites.id, id))
				.returning();

			if (!deleted) {
				return false;
			}

			await this.cache?.deleteWebsiteById(id);

			if (deleted.organizationId) {
				await this.cache?.deleteWebsiteByDomain(deleted.domain, {
					organizationId: deleted.organizationId,
				});
			} else if (deleted.userId) {
				await this.cache?.deleteWebsiteByDomain(deleted.domain, {
					userId: deleted.userId,
				});
			}

			await this.cache?.invalidateLists({
				userIds: deleted.userId ? [deleted.userId] : [],
				organizationIds: deleted.organizationId ? [deleted.organizationId] : [],
				userOrgPairs:
					deleted.userId && deleted.organizationId
						? [
								{
									userId: deleted.userId,
									organizationId: deleted.organizationId,
								},
							]
						: [],
			});

			return true;
		} catch (error) {
			console.error("WebsiteService.deleteById failed:", {
				error: String(error),
			});
			return false;
		}
	}
}

export const websiteService = new WebsiteService();
