import {
	and,
	type db as drizzleDb,
	eq,
	type InferSelectModel,
	isNull,
	ne,
	websites,
} from "@databuddy/db";
import { logger } from "@databuddy/shared/logger";
import { nanoid } from "nanoid";
import { z } from "zod";
import { invalidateWebsiteCaches } from "../utils/cache-invalidation";

export type Website = InferSelectModel<typeof websites>;

type Updates = { name?: string; domain?: string; integrations?: unknown };

const WEBSITE_NAME_REGEX = /^[a-zA-Z0-9\s\-_.]+$/;
const DOMAIN_REGEX =
	/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

export const websiteNameSchema = z
	.string()
	.min(1)
	.max(100)
	.regex(WEBSITE_NAME_REGEX, "Invalid website name format");

export const domainSchema = z.preprocess(
	(val) => {
		if (typeof val !== "string") {
			return val;
		}
		let domain = val.trim();
		if (domain.startsWith("http://") || domain.startsWith("https://")) {
			try {
				domain = new URL(domain).hostname;
			} catch {
				// Do nothing
			}
		}
		return domain;
	},
	z.string().min(1).max(253).regex(DOMAIN_REGEX, "Invalid domain format")
);

export const subdomainSchema = z
	.string()
	.max(63)
	.regex(/^[a-zA-Z0-9-]*$/, "Invalid subdomain format")
	.optional();

// Define typed errors
export class DuplicateDomainError extends Error {
	constructor(domain: string) {
		super(`A website with the domain "${domain}" already exists.`);
		this.name = "DuplicateDomainError";
	}
}

export class WebsiteNotFoundError extends Error {
	constructor() {
		super("Website not found");
		this.name = "WebsiteNotFoundError";
	}
}

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}

export type WebsiteError =
	| DuplicateDomainError
	| WebsiteNotFoundError
	| ValidationError
	| Error;

// Helper functions
export const buildFullDomain = (rawDomain: string, rawSubdomain?: string) => {
	const domain = rawDomain.trim().toLowerCase();
	const subdomain = rawSubdomain?.trim().toLowerCase();
	return subdomain ? `${subdomain}.${domain}` : domain;
};

export const buildWebsiteFilter = (userId: string, organizationId?: string) =>
	organizationId
		? eq(websites.organizationId, organizationId)
		: and(eq(websites.userId, userId), isNull(websites.organizationId));

// Types
export type CreateWebsiteInput = {
	name: string;
	domain: string;
	subdomain?: string;
	userId: string;
	organizationId?: string;
};

export type CreateWebsiteOptions = {
	skipDuplicateCheck?: boolean;
	logContext?: Record<string, any>;
};

// Website service class
export class WebsiteService {
	private readonly db: typeof drizzleDb;

	constructor(db: typeof drizzleDb) {
		this.db = db;
	}

	private async performDBOperation<T>(operation: () => Promise<T>): Promise<T> {
		try {
			return await operation();
		} catch (error) {
			throw new Error(`DB operation failed: ${String(error)}`);
		}
	}

	private async performTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
		try {
			return await this.db.transaction(fn);
		} catch (error) {
			throw new Error(`Transaction failed: ${String(error)}`);
		}
	}

	private async invalidateCaches(
		websiteId: string,
		userId: string
	): Promise<void> {
		try {
			await invalidateWebsiteCaches(websiteId, userId);
		} catch (error) {
			throw new Error(`Cache invalidation failed: ${String(error)}`);
		}
	}

	async createWebsite(
		input: CreateWebsiteInput,
		options: CreateWebsiteOptions = {}
	): Promise<Website> {
		const { skipDuplicateCheck = false, logContext = {} } = options;

		// Validate name
		const nameValidation = websiteNameSchema.safeParse(input.name);
		if (!nameValidation.success) {
			throw new ValidationError(nameValidation.error.message);
		}

		// Validate domain
		const domainToCreate = buildFullDomain(input.domain, input.subdomain);
		const domainValidation = domainSchema.safeParse(domainToCreate);
		if (!domainValidation.success) {
			throw new ValidationError(domainValidation.error.message);
		}

		const validatedInput = { ...input, domain: domainToCreate };

		// Check duplicate
		if (!skipDuplicateCheck) {
			const websiteFilter = and(
				eq(websites.domain, validatedInput.domain),
				buildWebsiteFilter(validatedInput.userId, validatedInput.organizationId)
			);
			const dup = await this.performDBOperation(async () =>
				this.db.query.websites.findFirst({ where: websiteFilter })
			);
			if (dup) {
				throw new DuplicateDomainError(validatedInput.domain);
			}
		}

		// Insert
		const createdWebsite = await this.performTransaction(async (tx) => {
			const [website] = await tx
				.insert(websites)
				.values({
					id: nanoid(),
					name: validatedInput.name,
					domain: validatedInput.domain,
					userId: validatedInput.userId,
					organizationId: validatedInput.organizationId,
					status: "ACTIVE",
				})
				.returning();
			return website as Website;
		});

		// Log
		try {
			logger.info(
				{
					websiteId: createdWebsite.id,
					domain: createdWebsite.domain,
					userId: createdWebsite.userId,
					organizationId: createdWebsite.organizationId,
					...logContext,
				},
				`Website Created: "${createdWebsite.name}" with domain "${createdWebsite.domain}"`
			);
		} catch (error) {
			throw new Error(`Logging failed: ${String(error)}`);
		}

		// Invalidate caches
		await this.invalidateCaches(createdWebsite.id, input.userId);

		return createdWebsite;
	}

	async updateWebsite(
		websiteId: string,
		updates: Updates,
		userId: string,
		organizationId?: string
	): Promise<Website> {
		const finalUpdates = { ...updates };

		// Validate name if present
		if (finalUpdates.name) {
			const validation = websiteNameSchema.safeParse(finalUpdates.name);
			if (!validation.success) {
				throw new ValidationError(validation.error.message);
			}
		}

		// Validate domain if present
		if (finalUpdates.domain) {
			const domainToUpdate = buildFullDomain(finalUpdates.domain);
			const baseFilter = and(
				eq(websites.domain, domainToUpdate),
				buildWebsiteFilter(userId, organizationId)
			);
			const websiteFilter = and(baseFilter, ne(websites.id, websiteId));

			const dup = await this.performDBOperation(async () =>
				this.db.query.websites.findFirst({ where: websiteFilter })
			);

			if (dup) {
				throw new DuplicateDomainError(domainToUpdate);
			}
			finalUpdates.domain = domainToUpdate;
		}

		const updatedWebsite = await this.performDBOperation(async () => {
			const [w] = await this.db
				.update(websites)
				.set(finalUpdates)
				.where(eq(websites.id, websiteId))
				.returning();
			return w ?? null;
		});

		if (!updatedWebsite) {
			throw new WebsiteNotFoundError();
		}

		await this.invalidateCaches(websiteId, userId);

		return updatedWebsite;
	}

	async deleteWebsite(
		websiteId: string,
		userId: string
	): Promise<{ success: true }> {
		await this.performTransaction(async (tx) => {
			await tx.delete(websites).where(eq(websites.id, websiteId));
		});

		await this.invalidateCaches(websiteId, userId);

		return { success: true };
	}

	async toggleWebsitePublic(
		websiteId: string,
		isPublic: boolean,
		userId: string
	): Promise<Website> {
		const updatedWebsite = await this.performDBOperation(async () => {
			const [w] = await this.db
				.update(websites)
				.set({ isPublic })
				.where(eq(websites.id, websiteId))
				.returning();
			return w ?? null;
		});

		if (!updatedWebsite) {
			throw new WebsiteNotFoundError();
		}

		await this.invalidateCaches(websiteId, userId);

		return updatedWebsite;
	}

	async transferWebsite(
		websiteId: string,
		organizationId: string | null,
		userId: string
	): Promise<Website> {
		let transferredWebsite: Website | null;
		try {
			const [w] = await this.db
				.update(websites)
				.set({
					organizationId,
					updatedAt: new Date(),
				})
				.where(eq(websites.id, websiteId))
				.returning();
			transferredWebsite = w ?? null;
		} catch (error) {
			if (this.isUniqueConstraintError(error)) {
				throw new DuplicateDomainError("this domain");
			}
			throw new Error(`DB operation failed: ${String(error)}`);
		}

		if (!transferredWebsite) {
			throw new WebsiteNotFoundError();
		}

		try {
			logger.info(
				{
					websiteId: transferredWebsite.id,
					organizationId,
					userId,
					event: "Website Transferred",
				},
				`Website "${transferredWebsite.name}" was transferred to organization "${organizationId}"`
			);
		} catch (error) {
			throw new Error(`Logging failed: ${String(error)}`);
		}

		await this.invalidateCaches(websiteId, userId);

		return transferredWebsite;
	}

	async transferWebsiteToOrganization(
		websiteId: string,
		targetOrganizationId: string,
		userId: string
	): Promise<Website> {
		let transferredWebsite: Website | null;
		try {
			const [w] = await this.db
				.update(websites)
				.set({
					organizationId: targetOrganizationId,
					updatedAt: new Date(),
				})
				.where(eq(websites.id, websiteId))
				.returning();
			transferredWebsite = w ?? null;
		} catch (error) {
			if (this.isUniqueConstraintError(error)) {
				throw new DuplicateDomainError("this domain");
			}
			throw new Error(`DB operation failed: ${String(error)}`);
		}

		if (!transferredWebsite) {
			throw new WebsiteNotFoundError();
		}

		try {
			logger.info(
				{
					websiteId: transferredWebsite.id,
					targetOrganizationId,
					userId,
					event: "Website Transferred to Organization",
				},
				`Website "${transferredWebsite.name}" was transferred to organization "${targetOrganizationId}"`
			);
		} catch (error) {
			throw new Error(`Logging failed: ${String(error)}`);
		}

		await this.invalidateCaches(websiteId, userId);

		return transferredWebsite;
	}

	private isUniqueConstraintError(error: unknown): boolean {
		// PostgreSQL unique constraint violation code is 23505
		if (error && typeof error === "object") {
			const err = error as { code?: string; constraint?: string };
			return err.code === "23505";
		}
		return false;
	}
}
