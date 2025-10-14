import type { InferInsertModel } from 'drizzle-orm';
import { account, user, websites } from '../../drizzle/schema';
import type { SeedContext } from '../context';
import { createId } from '../utils/ids';

export type NewUser = InferInsertModel<typeof user>;
export type NewAccount = InferInsertModel<typeof account>;
export type NewWebsite = InferInsertModel<typeof websites>;

const DEFAULT_HASHED_PASSWORD =
	'358bf30ca7ceede1e8a4d050ffdd9455:c7e6aea60a40807311e1b8dc7e5087ed9a14e391df2c11aeac6730535adea98798d780ded59b3c69dd38c41076315dd471556b0ab58550ce9b8a27ca998c6e3a';

export function makeUser(
	ctx: Pick<SeedContext, 'faker' | 'now'>,
	overrides: Partial<NewUser> = {}
): NewUser {
	const createdAt = overrides.createdAt ?? ctx.now;
	const updatedAt = overrides.updatedAt ?? createdAt;

	return {
		id: overrides.id ?? createId(ctx.faker),
		name:
			overrides.name ??
			`${ctx.faker.person.firstName()} ${ctx.faker.person.lastName()}`,
		email: overrides.email ?? ctx.faker.internet.email(),
		emailVerified: overrides.emailVerified ?? false,
		image: overrides.image,
		firstName: overrides.firstName,
		lastName: overrides.lastName,
		status: overrides.status ?? 'ACTIVE',
		role: overrides.role ?? 'USER',
		createdAt,
		updatedAt,
		deletedAt: overrides.deletedAt ?? null,
		twoFactorEnabled: overrides.twoFactorEnabled ?? false,
	};
}

export interface MakeAccountOptions {
	userId: string;
	providerId?: string;
	passwordHash?: string;
}

export function makeAccount(
	ctx: Pick<SeedContext, 'faker' | 'now'>,
	options: MakeAccountOptions,
	overrides: Partial<NewAccount> = {}
): NewAccount {
	const createdAt = overrides.createdAt ?? ctx.now;
	const updatedAt = overrides.updatedAt ?? createdAt;

	return {
		id: overrides.id ?? createId(ctx.faker),
		accountId: overrides.accountId ?? options.userId,
		providerId: overrides.providerId ?? options.providerId ?? 'credential',
		userId: overrides.userId ?? options.userId,
		accessToken: overrides.accessToken ?? null,
		refreshToken: overrides.refreshToken ?? null,
		idToken: overrides.idToken ?? null,
		accessTokenExpiresAt: overrides.accessTokenExpiresAt ?? null,
		refreshTokenExpiresAt: overrides.refreshTokenExpiresAt ?? null,
		scope: overrides.scope ?? null,
		password: overrides.password ?? options.passwordHash ?? DEFAULT_HASHED_PASSWORD,
		createdAt,
		updatedAt,
	};
}

export interface MakeWebsiteOptions {
	userId: string;
	domain?: string;
	name?: string;
	isPublic?: boolean;
}

export function makeWebsite(
	ctx: Pick<SeedContext, 'faker' | 'now'>,
	options: MakeWebsiteOptions,
	overrides: Partial<NewWebsite> = {}
): NewWebsite {
	const createdAt = overrides.createdAt ?? ctx.now;
	const updatedAt = overrides.updatedAt ?? createdAt;

	return {
		id: overrides.id ?? createId(ctx.faker),
		domain: overrides.domain ?? options.domain ?? ctx.faker.internet.domainName(),
		name: overrides.name ?? options.name ?? ctx.faker.company.name(),
		status: overrides.status ?? 'ACTIVE',
		userId: overrides.userId ?? options.userId,
		isPublic: overrides.isPublic ?? options.isPublic ?? true,
		createdAt,
		updatedAt,
		deletedAt: overrides.deletedAt ?? null,
	};
}
