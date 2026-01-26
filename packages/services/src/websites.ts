import { randomUUID } from "node:crypto";
import {
	and,
	db,
	eq,
	type InferInsertModel,
	type InferSelectModel,
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

export class DuplicateDomainError extends Error {
	constructor(domain: string) {
		super(`A website with the domain "${domain}" already exists.`);
		this.name = "DuplicateDomainError";
	}
}

export class WebsiteNotFoundError extends Error {
	constructor(message = "Website not found") {
		super(message);
		this.name = "WebsiteNotFoundError";
	}
}

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}

export const buildWebsiteFilter = (organizationId: string) =>
	eq(websites.organizationId, organizationId);

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
				await this.cache?.setWebsiteByDomain(
					website.domain,
					website.organizationId,
					website
				);
			}

			return website ?? null;
		} catch (error) {
			console.error("WebsiteService.getById failed:", { error: String(error) });
			return null;
		}
	}

	async getByDomain(
		domain: string,
		organizationId: string
	): Promise<Website | null> {
		try {
			const normalizedDomain = domain.trim().toLowerCase();

			const cached = await this.cache?.getWebsiteByDomain(
				normalizedDomain,
				organizationId
			);
			if (cached) {
				return cached;
			}

			const website =
				(await this.database.query.websites.findFirst({
					where: and(
						eq(websites.domain, normalizedDomain),
						eq(websites.organizationId, organizationId)
					),
				})) ?? null;

			if (website) {
				await this.cache?.setWebsite(website);
				await this.cache?.setWebsiteByDomain(
					website.domain,
					website.organizationId,
					website
				);
			}

			return website;
		} catch (error) {
			console.error("WebsiteService.getByDomain failed:", {
				error: String(error),
			});
			return null;
		}
	}

	async list(organizationId: string): Promise<Website[]> {
		try {
			const cached = await this.cache?.getList(organizationId);
			if (cached) {
				return cached;
			}

			const rows = await this.database.query.websites.findMany({
				where: eq(websites.organizationId, organizationId),
			});
			await this.cache?.setList(organizationId, rows);
			return rows;
		} catch (error) {
			console.error("WebsiteService.list failed:", { error: String(error) });
			return [];
		}
	}

	async create(input: CreateWebsiteInput): Promise<Website> {
		const normalizedDomain = input.domain.trim().toLowerCase();

		const existing = await this.getByDomain(
			normalizedDomain,
			input.organizationId
		);

		if (existing) {
			throw new DuplicateDomainError(normalizedDomain);
		}

		try {
			const [created] = await this.database
				.insert(websites)
				.values({
					...input,
					domain: normalizedDomain,
					id: input.id ?? randomUUID(),
					updatedAt: new Date(),
				})
				.returning();

			if (!created) {
				throw new Error("Failed to create website");
			}

			await this.cache?.setWebsite(created);
			await this.cache?.setWebsiteByDomain(
				created.domain,
				created.organizationId,
				created
			);
			await this.cache?.invalidateLists([created.organizationId]);

			return created;
		} catch (error) {
			if (
				error instanceof DuplicateDomainError ||
				error instanceof ValidationError ||
				error instanceof WebsiteNotFoundError
			) {
				throw error;
			}
			console.error("WebsiteService.create failed:", { error: String(error) });
			throw new Error(
				`Failed to create website: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async updateById(id: string, updates: UpdateWebsiteInput): Promise<Website> {
		const hasAtLeastOneUpdate = (() => {
			for (const value of Object.values(updates)) {
				if (value !== undefined) {
					return true;
				}
			}
			return false;
		})();

		if (!hasAtLeastOneUpdate) {
			const website = await this.getById(id);
			if (!website) {
				throw new WebsiteNotFoundError();
			}
			return website;
		}

		const before = await this.getByIdFromDb(id);
		if (!before) {
			throw new WebsiteNotFoundError();
		}

		const normalizedUpdates = { ...updates };
		if (updates.domain !== undefined) {
			const normalizedDomain = updates.domain.trim().toLowerCase();

			if (normalizedDomain !== before.domain.toLowerCase()) {
				const existing = await this.getByDomain(
					normalizedDomain,
					before.organizationId
				);

				if (existing && existing.id !== id) {
					throw new DuplicateDomainError(normalizedDomain);
				}
			}

			normalizedUpdates.domain = normalizedDomain;
		}

		try {
			const [updated] = await this.database
				.update(websites)
				.set({ ...normalizedUpdates, updatedAt: new Date() })
				.where(eq(websites.id, id))
				.returning();

			if (!updated) {
				throw new WebsiteNotFoundError();
			}

			await this.cache?.setWebsite(updated);

			const scopeChanged = before.organizationId !== updated.organizationId;
			const domainChanged =
				before.domain.toLowerCase() !== updated.domain.toLowerCase();

			if (scopeChanged || domainChanged) {
				await this.cache?.deleteWebsiteByDomain(
					before.domain,
					before.organizationId
				);
			}

			await this.cache?.setWebsiteByDomain(
				updated.domain,
				updated.organizationId,
				updated
			);

			const organizationIds = Array.from(
				new Set([before.organizationId, updated.organizationId])
			);

			await this.cache?.invalidateLists(organizationIds);

			return updated;
		} catch (error) {
			if (
				error instanceof DuplicateDomainError ||
				error instanceof ValidationError ||
				error instanceof WebsiteNotFoundError
			) {
				throw error;
			}
			console.error("WebsiteService.updateById failed:", {
				error: String(error),
			});
			throw new Error(
				`Failed to update website: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async deleteById(id: string): Promise<void> {
		const before = await this.getByIdFromDb(id);
		if (!before) {
			throw new WebsiteNotFoundError();
		}

		try {
			const [deleted] = await this.database
				.delete(websites)
				.where(eq(websites.id, id))
				.returning();

			if (!deleted) {
				throw new WebsiteNotFoundError();
			}

			await this.cache?.deleteWebsiteById(id);
			await this.cache?.deleteWebsiteByDomain(
				deleted.domain,
				deleted.organizationId
			);
			await this.cache?.invalidateLists([deleted.organizationId]);
		} catch (error) {
			if (
				error instanceof DuplicateDomainError ||
				error instanceof ValidationError ||
				error instanceof WebsiteNotFoundError
			) {
				throw error;
			}
			console.error("WebsiteService.deleteById failed:", {
				error: String(error),
			});
			throw new Error(
				`Failed to delete website: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
}

export const websiteService = new WebsiteService();
