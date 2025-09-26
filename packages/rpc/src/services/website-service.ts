import { type db as drizzleDb, websites } from '@databuddy/db';
import { logger } from '@databuddy/shared';
import { and, eq, type InferSelectModel, isNull } from 'drizzle-orm';
import { Effect, pipe } from 'effect';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { invalidateWebsiteCaches } from '../utils/cache-invalidation';

type Website = InferSelectModel<typeof websites>;

type Updates = { name?: string; domain?: string; integrations?: unknown };

const WEBSITE_NAME_REGEX = /^[a-zA-Z0-9\s\-_.]+$/;
const DOMAIN_REGEX =
	/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

export const websiteNameSchema = z
	.string()
	.min(1)
	.max(100)
	.regex(WEBSITE_NAME_REGEX, 'Invalid website name format');

export const domainSchema = z.preprocess(
	(val) => {
		if (typeof val !== 'string') {
			return val;
		}
		let domain = val.trim();
		if (domain.startsWith('http://') || domain.startsWith('https://')) {
			try {
				domain = new URL(domain).hostname;
			} catch {
				// Do nothing
			}
		}
		return domain;
	},
	z.string().min(1).max(253).regex(DOMAIN_REGEX, 'Invalid domain format')
);

export const subdomainSchema = z
	.string()
	.max(63)
	.regex(/^[a-zA-Z0-9-]*$/, 'Invalid subdomain format')
	.optional();

// Define typed errors
export class DuplicateDomainError extends Error {
	constructor(domain: string) {
		super(`A website with the domain "${domain}" already exists.`);
		this.name = 'DuplicateDomainError';
	}
}

export class WebsiteNotFoundError extends Error {
	constructor() {
		super('Website not found');
		this.name = 'WebsiteNotFoundError';
	}
}

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ValidationError';
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
export interface CreateWebsiteInput {
	name: string;
	domain: string;
	subdomain?: string;
	userId: string;
	organizationId?: string;
}

export interface CreateWebsiteOptions {
	skipDuplicateCheck?: boolean;
	logContext?: Record<string, any>;
}

// Website service class
export class WebsiteService {
	private db: typeof drizzleDb;

	constructor(db: typeof drizzleDb) {
		this.db = db;
	}

	private performDBOperation<T>(
		operation: () => Promise<T>
	): Effect.Effect<T, WebsiteError> {
		return Effect.tryPromise({
			try: operation,
			catch: (error) =>
				new Error(`DB operation failed: ${String(error)}`) as WebsiteError,
		});
	}

	private performTransaction<T>(
		fn: (tx: any) => Promise<T>
	): Effect.Effect<T, WebsiteError> {
		return Effect.tryPromise({
			try: () => this.db.transaction(fn),
			catch: (error) =>
				new Error(`Transaction failed: ${String(error)}`) as WebsiteError,
		});
	}

	private validateNameAndFlow(
		input: CreateWebsiteInput
	): Effect.Effect<CreateWebsiteInput, ValidationError> {
		const validation = websiteNameSchema.safeParse(input.name);
		return validation.success
			? Effect.succeed(input)
			: Effect.fail(new ValidationError(validation.error.message));
	}

	private validateDomainAndFlow(
		input: CreateWebsiteInput
	): Effect.Effect<CreateWebsiteInput, ValidationError> {
		const domainToCreate = buildFullDomain(input.domain, input.subdomain);
		const validation = domainSchema.safeParse(domainToCreate);
		return validation.success
			? Effect.succeed({ ...input, domain: domainToCreate })
			: Effect.fail(new ValidationError(validation.error.message));
	}

	private checkDuplicateAndFlow(
		input: CreateWebsiteInput,
		skipDuplicateCheck: boolean
	): Effect.Effect<CreateWebsiteInput, DuplicateDomainError | ValidationError> {
		if (skipDuplicateCheck) {
			return Effect.succeed(input);
		}
		const websiteFilter = and(
			eq(websites.domain, input.domain),
			buildWebsiteFilter(input.userId, input.organizationId)
		);
		return pipe(
			this.performDBOperation<Website | null>(() =>
				this.db.query.websites.findFirst({ where: websiteFilter })
			),
			Effect.flatMap((dup) =>
				dup
					? Effect.fail(new DuplicateDomainError(input.domain))
					: Effect.succeed(input)
			)
		);
	}

	private logCreationAndFlow(
		createdWebsite: Website,
		logContext: Record<string, unknown>
	): Effect.Effect<Website, WebsiteError> {
		return pipe(
			Effect.try({
				try: () =>
					logger.success(
						'Website Created',
						`New website "${createdWebsite.name}" was created with domain "${createdWebsite.domain}"`,
						{
							websiteId: createdWebsite.id,
							domain: createdWebsite.domain,
							userId: createdWebsite.userId,
							organizationId: createdWebsite.organizationId,
							...logContext,
						}
					),
				catch: (error) =>
					new Error(`Logging failed: ${String(error)}`) as WebsiteError,
			}),
			Effect.as(createdWebsite)
		);
	}

	private invalidateCachesAndFlow(
		website: Website,
		userId: string
	): Effect.Effect<Website, WebsiteError> {
		return pipe(
			Effect.tryPromise({
				try: () => invalidateWebsiteCaches(website.id, userId),
				catch: (error) =>
					new Error(
						`Cache invalidation failed: ${String(error)}`
					) as WebsiteError,
			}),
			Effect.as(website)
		);
	}

	createWebsite(
		input: CreateWebsiteInput,
		options: CreateWebsiteOptions = {}
	): Effect.Effect<Website, WebsiteError> {
		const { skipDuplicateCheck = false, logContext = {} } = options;

		const insertFn = (tx: any) =>
			tx
				.insert(websites)
				.values({
					id: nanoid(),
					name: input.name,
					domain: input.domain,
					userId: input.userId,
					organizationId: input.organizationId,
					status: 'ACTIVE',
				})
				.returning()
				.then(([website]) => website as Website);

		return pipe(
			Effect.succeed(input),
			Effect.flatMap(this.validateNameAndFlow),
			Effect.flatMap(this.validateDomainAndFlow),
			Effect.flatMap((validatedInput) =>
				skipDuplicateCheck
					? Effect.succeed(validatedInput)
					: this.checkDuplicateAndFlow(validatedInput, skipDuplicateCheck)
			),
			Effect.flatMap(() => this.performTransaction<Website>(insertFn)),
			Effect.flatMap((createdWebsite) =>
				pipe(
					this.logCreationAndFlow(createdWebsite, logContext),
					Effect.flatMap(() =>
						this.invalidateCachesAndFlow(createdWebsite, input.userId)
					),
					Effect.as(createdWebsite)
				)
			)
		);
	}

	private validateNameIfPresentAndFlow(
		updates: Updates
	): Effect.Effect<Updates, ValidationError> {
		if (!updates.name) {
			return Effect.succeed(updates);
		}
		const validation = websiteNameSchema.safeParse(updates.name);
		return validation.success
			? Effect.succeed(updates)
			: Effect.fail(new ValidationError(validation.error.message));
	}

	private validateDomainIfPresentAndFlow(
		updates: Updates,
		userId: string,
		organizationId?: string
	): Effect.Effect<Updates, WebsiteError> {
		if (!updates.domain) {
			return Effect.succeed(updates);
		}
		const domainToUpdate = buildFullDomain(updates.domain as string);
		const websiteFilter = and(
			eq(websites.domain, domainToUpdate),
			buildWebsiteFilter(userId, organizationId)
		);
		return pipe(
			this.performDBOperation<Website | null>(() =>
				this.db.query.websites.findFirst({ where: websiteFilter })
			),
			Effect.flatMap((dup) =>
				dup
					? Effect.fail(new DuplicateDomainError(domainToUpdate))
					: Effect.succeed({ ...updates, domain: domainToUpdate })
			)
		);
	}
	updateWebsite(
		websiteId: string,
		updates: Updates,
		userId: string,
		organizationId?: string
	): Effect.Effect<Website, WebsiteError> {
		const updateFn = (finalUpdates: Updates) =>
			this.db
				.update(websites)
				.set(finalUpdates)
				.where(eq(websites.id, websiteId))
				.returning()
				.then(([w]) => w ?? (null as Website | null));

		return pipe(
			Effect.succeed(updates),
			Effect.flatMap(this.validateNameIfPresentAndFlow),
			Effect.flatMap((u) =>
				this.validateDomainIfPresentAndFlow(u, userId, organizationId)
			),
			Effect.flatMap((finalUpdates) =>
				this.performDBOperation<Website | null>(() => updateFn(finalUpdates))
			),
			Effect.flatMap((updatedWebsite) =>
				updatedWebsite
					? pipe(
							Effect.tryPromise({
								try: () => invalidateWebsiteCaches(websiteId, userId),
								catch: (error) =>
									new Error(
										`Cache invalidation failed: ${String(error)}`
									) as WebsiteError,
							}),
							Effect.as(updatedWebsite)
						)
					: Effect.fail(new WebsiteNotFoundError())
			)
		);
	}

	deleteWebsite(
		websiteId: string,
		userId: string
	): Effect.Effect<{ success: true }, WebsiteError> {
		const deleteFn = (tx: any) =>
			tx.delete(websites).where(eq(websites.id, websiteId));

		return pipe(
			this.performTransaction<void>(deleteFn),
			Effect.flatMap(() =>
				Effect.tryPromise({
					try: () => invalidateWebsiteCaches(websiteId, userId),
					catch: (error) =>
						new Error(
							`Cache invalidation failed: ${String(error)}`
						) as WebsiteError,
				})
			),
			Effect.map(() => ({ success: true }))
		);
	}

	toggleWebsitePublic(
		websiteId: string,
		isPublic: boolean,
		userId: string
	): Effect.Effect<Website, WebsiteError> {
		const updateFn = () =>
			this.db
				.update(websites)
				.set({ isPublic })
				.where(eq(websites.id, websiteId))
				.returning()
				.then(([w]) => w ?? (null as Website | null));

		return pipe(
			this.performDBOperation<Website | null>(updateFn),
			Effect.flatMap((updatedWebsite) =>
				updatedWebsite
					? pipe(
							Effect.tryPromise({
								try: () => invalidateWebsiteCaches(websiteId, userId),
								catch: (error) =>
									new Error(
										`Cache invalidation failed: ${String(error)}`
									) as WebsiteError,
							}),
							Effect.as(updatedWebsite)
						)
					: Effect.fail(new WebsiteNotFoundError())
			)
		);
	}

	transferWebsite(
		websiteId: string,
		organizationId: string | null,
		userId: string
	): Effect.Effect<Website, WebsiteError> {
		const updateFn = () =>
			this.db
				.update(websites)
				.set({
					organizationId,
					updatedAt: new Date(),
				})
				.where(eq(websites.id, websiteId))
				.returning()
				.then(([w]) => w ?? (null as Website | null));

		return pipe(
			this.performDBOperation<Website | null>(updateFn),
			Effect.flatMap((transferredWebsite) =>
				transferredWebsite
					? pipe(
							Effect.try({
								try: () =>
									logger.info(
										'Website Transferred',
										`Website "${transferredWebsite.name}" was transferred to organization "${organizationId}"`,
										{
											websiteId: transferredWebsite.id,
											organizationId,
											userId,
										}
									),
								catch: (error) =>
									new Error(`Logging failed: ${String(error)}`) as WebsiteError,
							}),
							Effect.flatMap(() =>
								Effect.tryPromise({
									try: () => invalidateWebsiteCaches(websiteId, userId),
									catch: (error) =>
										new Error(
											`Cache invalidation failed: ${String(error)}`
										) as WebsiteError,
								})
							),
							Effect.as(transferredWebsite)
						)
					: Effect.fail(new WebsiteNotFoundError())
			)
		);
	}
}
