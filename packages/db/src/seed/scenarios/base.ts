import { account, user, websites } from '../../drizzle/schema';
import type { SeedContext } from '../context';
import { makeAccount, makeUser, makeWebsite } from '../factories/postgres';
import type { ScenarioResult } from './types';

export async function runBaseScenario(ctx: SeedContext): Promise<ScenarioResult> {
	const adminUserSeed = makeUser(ctx, {
		name: 'DataBuddy',
		email: 'admin@databuddy.cc',
		emailVerified: true,
		image: 'https://www.databuddy.cc/logo.svg',
		firstName: 'Data',
		lastName: 'Buddy',
		role: 'ADMIN',
		status: 'ACTIVE',
	});

	const adminAccountSeed = makeAccount(
		ctx,
		{ userId: adminUserSeed.id, providerId: 'credential' },
		{
			accountId: adminUserSeed.id,
		}
	);

	const websiteSeed = makeWebsite(ctx, {
		userId: adminUserSeed.id,
		domain: ctx.config.domain,
		name: 'Example Website',
		isPublic: true,
	});

	let persistedUser = adminUserSeed;
	let persistedWebsite = websiteSeed;

	if (!ctx.config.dryRun) {
		const [createdUser] = await ctx.db
			.insert(user)
			.values(adminUserSeed)
			.returning();
		persistedUser = createdUser ?? adminUserSeed;

		const [_] = await ctx.db.insert(account).values({
			...adminAccountSeed,
			userId: persistedUser.id,
			accountId: persistedUser.id,
		}).returning();
		

		const [createdWebsite] = await ctx.db
			.insert(websites)
			.values({
				...websiteSeed,
				userId: persistedUser.id,
			})
			.returning();

		persistedWebsite = createdWebsite ?? websiteSeed;
	}

	ctx.caches.users.push(persistedUser);
	ctx.caches.websites.push(persistedWebsite);

	return {
		users: ctx.caches.users.length,
		websites: ctx.caches.websites.length,
		events: 0,
		errors: 0,
		webVitals: 0,
		customEvents: 0,
		outgoingLinks: 0,
		ids: {
			adminUserId: persistedUser.id,
			websiteId: persistedWebsite.id,
		},
	};
}
