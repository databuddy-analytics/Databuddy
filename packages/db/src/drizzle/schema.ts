import { isNotNull, isNull, sql } from 'drizzle-orm';
import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from 'drizzle-orm/pg-core';

export const funnelGoalType = pgEnum('FunnelGoalType', [
	'COMPLETION',
	'STEP_CONVERSION',
	'TIME_TO_CONVERT',
]);
export const funnelStepType = pgEnum('FunnelStepType', [
	'PAGE_VIEW',
	'EVENT',
	'CUSTOM',
]);
export const memberRole = pgEnum('MemberRole', [
	'owner',
	'admin',
	'member',
	'viewer',
]);
export const organizationRole = pgEnum('OrganizationRole', [
	'admin',
	'owner',
	'member',
	'viewer',
]);

export const role = pgEnum('Role', [
	'ADMIN',
	'USER',
	'EARLY_ADOPTER',
	'INVESTOR',
	'BETA_TESTER',
	'GUEST',
]);

export const userStatus = pgEnum('UserStatus', [
	'ACTIVE',
	'SUSPENDED',
	'INACTIVE',
]);
export const verificationStatus = pgEnum('VerificationStatus', [
	'PENDING',
	'VERIFIED',
	'FAILED',
]);
export const websiteStatus = pgEnum('WebsiteStatus', [
	'ACTIVE',
	'HEALTHY',
	'UNHEALTHY',
	'INACTIVE',
	'PENDING',
]);

export const account = pgTable(
	'account',
	{
		id: text().primaryKey().notNull(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id').notNull(),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', {
			mode: 'string',
		}),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
			mode: 'string',
		}),
		scope: text(),
		password: text(),
		createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
		updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
	},
	(table) => [
		index('accounts_userId_idx').using(
			'btree',
			table.userId.asc().nullsLast().op('text_ops')
		),
		uniqueIndex('accounts_provider_account_unique').using(
			'btree',
			table.providerId.asc().nullsLast().op('text_ops'),
			table.accountId.asc().nullsLast().op('text_ops')
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'account_user_id_user_id_fk',
		}).onDelete('cascade'),
	]
);

export const session = pgTable(
	'session',
	{
		id: text().primaryKey().notNull(),
		expiresAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
		token: text().notNull(),
		createdAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
		ipAddress: text(),
		userAgent: text(),
		userId: text(),
		activeOrganizationId: text('active_organization_id'),
	},
	(table) => [
		uniqueIndex('sessions_token_key').using(
			'btree',
			table.token.asc().nullsLast().op('text_ops')
		),
		index('sessions_userId_idx').using(
			'btree',
			table.userId.asc().nullsLast().op('text_ops')
		),
		index('sessions_expiresAt_idx').using(
			'btree',
			table.expiresAt.asc().nullsLast()
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'session_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	]
);

export const invitation = pgTable(
	'invitation',
	{
		id: text().primaryKey().notNull(),
		organizationId: text('organization_id').notNull(),
		email: text().notNull(),
		role: text().default('member'),
		teamId: text('team_id'),
		status: text().default('pending').notNull(),
		expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
		inviterId: text('inviter_id').notNull(),
	},
	(table) => [
		index('invitations_email_idx').using(
			'btree',
			table.email.asc().nullsLast().op('text_ops')
		),
		index('invitations_organizationId_idx').using(
			'btree',
			table.organizationId.asc().nullsLast().op('text_ops')
		),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'invitation_organization_id_organization_id_fk',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.inviterId],
			foreignColumns: [user.id],
			name: 'invitation_inviter_id_user_id_fk',
		}).onDelete('cascade'),
	]
);

export const member = pgTable(
	'member',
	{
		id: text().primaryKey().notNull(),
		organizationId: text('organization_id').notNull(),
		userId: text('user_id').notNull(),
		role: text().default('member').notNull(),
		teamId: text('team_id'),
		createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
	},
	(table) => [
		index('members_userId_idx').using(
			'btree',
			table.userId.asc().nullsLast().op('text_ops')
		),
		index('members_organizationId_idx').using(
			'btree',
			table.organizationId.asc().nullsLast().op('text_ops')
		),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'member_organization_id_organization_id_fk',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'member_user_id_user_id_fk',
		}).onDelete('cascade'),
	]
);

export const verification = pgTable(
	'verification',
	{
		id: text().primaryKey().notNull(),
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
		createdAt: timestamp('created_at', { mode: 'string' }),
		updatedAt: timestamp('updated_at', { mode: 'string' }),
	},
	(table) => [
		index('verifications_identifier_idx').using(
			'btree',
			table.identifier.asc().nullsLast().op('text_ops')
		),
		index('verifications_expiresAt_idx').using(
			'btree',
			table.expiresAt.asc().nullsLast()
		),
	]
);

export const twoFactor = pgTable(
	'two_factor',
	{
		id: text().primaryKey().notNull(),
		secret: text().notNull(),
		backupCodes: text('backup_codes').notNull(),
		userId: text('user_id').notNull(),
	},
	(table) => [
		index('twoFactor_secret_idx').using(
			'btree',
			table.secret.asc().nullsLast().op('text_ops')
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'two_factor_user_id_user_id_fk',
		}).onDelete('cascade'),
	]
);

export const userPreferences = pgTable(
	'user_preferences',
	{
		id: text().primaryKey().notNull(),
		userId: text().notNull(),
		timezone: text().default('auto').notNull(),
		dateFormat: text().default('MMM D, YYYY').notNull(),
		timeFormat: text().default('h:mm a').notNull(),
		createdAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	},
	(table) => [
		uniqueIndex('user_preferences_userId_key').using(
			'btree',
			table.userId.asc().nullsLast().op('text_ops')
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'user_preferences_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	]
);

export const websites = pgTable(
	'websites',
	{
		id: text().primaryKey().notNull(),
		domain: text().notNull(),
		name: text(),
		status: websiteStatus().default('ACTIVE').notNull(),
		userId: text(),
		isPublic: boolean().default(false).notNull(),
		createdAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		deletedAt: timestamp({ precision: 3, mode: 'string' }),
		organizationId: text('organization_id'),
	},
	(table) => [
		uniqueIndex('websites_user_domain_unique')
			.on(table.userId, table.domain)
			.where(isNull(table.organizationId)),
		uniqueIndex('websites_org_domain_unique')
			.on(table.organizationId, table.domain)
			.where(isNotNull(table.organizationId)),
		index('websites_userId_idx').using(
			'btree',
			table.userId.asc().nullsLast().op('text_ops')
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'websites_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('set null'),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'websites_organization_id_organization_id_fk',
		}).onDelete('cascade'),
	]
);

export const user = pgTable(
	'user',
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		email: text().notNull(),
		emailVerified: boolean('email_verified').notNull(),
		image: text(),
		firstName: text(),
		lastName: text(),
		status: userStatus().default('ACTIVE').notNull(),
		createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
		updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
		deletedAt: timestamp({ precision: 3, mode: 'string' }),
		role: role().default('USER').notNull(),
		twoFactorEnabled: boolean('two_factor_enabled'),
	},
	(table) => [unique('users_email_unique').on(table.email)]
);

export const userStripeConfig = pgTable(
	'user_stripe_config',
	{
		id: text().primaryKey().notNull(),
		userId: text('user_id').notNull(),
		webhookToken: text('webhook_token').notNull(),
		stripeSecretKey: text('stripe_secret_key').notNull(),
		stripePublishableKey: text('stripe_publishable_key'),
		webhookSecret: text('webhook_secret').notNull(),
		isLiveMode: boolean('is_live_mode').default(false).notNull(),
		isActive: boolean('is_active').default(true).notNull(),
		lastWebhookAt: timestamp('last_webhook_at', { mode: 'string' }),
		webhookFailureCount: integer('webhook_failure_count').default(0).notNull(),
		createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
		updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
	},
	(table) => [
		uniqueIndex('user_stripe_config_userId_key').using(
			'btree',
			table.userId.asc().nullsLast().op('text_ops')
		),
		uniqueIndex('user_stripe_config_webhookToken_key').using(
			'btree',
			table.webhookToken.asc().nullsLast().op('text_ops')
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'user_stripe_config_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	]
);

export const funnelGoals = pgTable(
	'funnel_goals',
	{
		id: text().primaryKey().notNull(),
		funnelId: text().notNull(),
		goalType: funnelGoalType().notNull(),
		targetValue: text(),
		description: text(),
		isActive: boolean().default(true).notNull(),
		createdAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
	},
	(table) => [
		index('funnel_goals_funnelId_idx').using(
			'btree',
			table.funnelId.asc().nullsLast().op('text_ops')
		),
		foreignKey({
			columns: [table.funnelId],
			foreignColumns: [funnelDefinitions.id],
			name: 'funnel_goals_funnelId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	]
);

export const funnelDefinitions = pgTable(
	'funnel_definitions',
	{
		id: text().primaryKey().notNull(),
		websiteId: text().notNull(),
		name: text().notNull(),
		description: text(),
		steps: jsonb().notNull(),
		filters: jsonb(),
		isActive: boolean().default(true).notNull(),
		createdBy: text().notNull(),
		createdAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		deletedAt: timestamp({ precision: 3, mode: 'string' }),
	},
	(table) => [
		index('funnel_definitions_createdBy_idx').using(
			'btree',
			table.createdBy.asc().nullsLast().op('text_ops')
		),
		index('funnel_definitions_websiteId_idx').using(
			'btree',
			table.websiteId.asc().nullsLast().op('text_ops')
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: 'funnel_definitions_websiteId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: 'funnel_definitions_createdBy_fkey',
		})
			.onUpdate('cascade')
			.onDelete('restrict'),
	]
);

export const goals = pgTable(
	'goals',
	{
		id: text().primaryKey().notNull(),
		websiteId: text().notNull(),
		type: text().notNull(), // e.g., 'PAGE_VIEW', 'EVENT', 'CUSTOM'
		target: text().notNull(), // event name or page path
		name: text().notNull(),
		description: text(),
		filters: jsonb(),
		isActive: boolean().default(true).notNull(),
		createdBy: text().notNull(),
		createdAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		deletedAt: timestamp({ precision: 3, mode: 'string' }),
	},
	(table) => [
		index('goals_websiteId_idx').using(
			'btree',
			table.websiteId.asc().nullsLast().op('text_ops')
		),
		index('goals_createdBy_idx').using(
			'btree',
			table.createdBy.asc().nullsLast().op('text_ops')
		),
		index('goals_websiteId_deletedAt_createdAt_idx').using(
			'btree',
			table.websiteId.asc().nullsLast().op('text_ops'),
			table.deletedAt.asc().nullsLast(),
			table.createdAt.desc().nullsLast()
		),
		index('goals_deletedAt_idx').using(
			'btree',
			table.deletedAt.asc().nullsLast()
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: 'goals_websiteId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: 'goals_createdBy_fkey',
		})
			.onUpdate('cascade')
			.onDelete('restrict'),
	]
);

export const team = pgTable(
	'team',
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		organizationId: text('organization_id').notNull(),
		createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
		updatedAt: timestamp('updated_at', { mode: 'string' }),
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'team_organization_id_organization_id_fk',
		}).onDelete('cascade'),
	]
);

export const apiKeyType = pgEnum('api_key_type', ['user', 'sdk', 'automation']);
export const apiScope = pgEnum('api_scope', [
	'read:data',
	'write:data',
	'read:experiments',
	'track:events',
	'admin:apikeys',
]);

// Resource type for flexible, future-proof per-resource access control
export const apiResourceType = pgEnum('api_resource_type', [
	'global',
	'website',
	'ab_experiment',
	'feature_flag',
]);

export const apikey = pgTable(
	'apikey',
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		prefix: text().notNull(),
		start: text().notNull(),
		key: text().notNull(),
		// New: store hash of the secret at rest; keep plaintext `key` during migration/backfill
		keyHash: text('key_hash'),
		userId: text('user_id'),
		organizationId: text('organization_id'),
		type: apiKeyType('type').notNull().default('user'),
		scopes: apiScope('scopes').array().notNull().default([]),
		enabled: boolean('enabled').notNull().default(true),
		// Optional lifecycle field to complement `enabled`
		revokedAt: timestamp('revoked_at', { mode: 'string' }),
		rateLimitEnabled: boolean('rate_limit_enabled').notNull().default(true),
		rateLimitTimeWindow: integer('rate_limit_time_window'),
		rateLimitMax: integer('rate_limit_max'),
		requestCount: integer('request_count').notNull().default(0),
		remaining: integer('remaining'),
		lastRequest: timestamp('last_request', { mode: 'string' }),
		lastRefillAt: timestamp('last_refill_at', { mode: 'string' }),
		refillInterval: integer('refill_interval'),
		refillAmount: integer('refill_amount'),
		expiresAt: timestamp('expires_at', { mode: 'string' }),
		metadata: jsonb('metadata').default({}),
		createdAt: timestamp('created_at', { mode: 'string' })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp('updated_at', { mode: 'string' })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'apikey_user_id_user_id_fk',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'apikey_organization_id_organization_id_fk',
		}).onDelete('cascade'),
		uniqueIndex('apikey_key_unique').using(
			'btree',
			table.key.asc().nullsLast().op('text_ops')
		),
		index('apikey_user_id_idx').using(
			'btree',
			table.userId.asc().nullsLast().op('text_ops')
		),
		index('apikey_organization_id_idx').using(
			'btree',
			table.organizationId.asc().nullsLast().op('text_ops')
		),
		index('apikey_prefix_idx').using(
			'btree',
			table.prefix.asc().nullsLast().op('text_ops')
		),
		index('apikey_key_hash_idx').using(
			'btree',
			table.keyHash.asc().nullsLast().op('text_ops')
		),
		index('apikey_enabled_idx').using('btree', table.enabled.asc().nullsLast()),
	]
);

// Mapping table for per-resource access and granular scopes
export const apikeyAccess = pgTable(
	'apikey_access',
	{
		id: text().primaryKey().notNull(),
		apikeyId: text('apikey_id').notNull(),
		resourceType: apiResourceType('resource_type').notNull().default('global'),
		// Nullable when resourceType = 'global'
		resourceId: text('resource_id'),
		scopes: apiScope('scopes').array().notNull().default([]),
		createdAt: timestamp('created_at', { mode: 'string' })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp('updated_at', { mode: 'string' })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		foreignKey({
			columns: [table.apikeyId],
			foreignColumns: [apikey.id],
			name: 'apikey_access_apikey_id_fkey',
		}).onDelete('cascade'),
		index('apikey_access_apikey_id_idx').using(
			'btree',
			table.apikeyId.asc().nullsLast().op('text_ops')
		),
		index('apikey_access_resource_idx').using(
			'btree',
			table.resourceType.asc().nullsLast(),
			table.resourceId.asc().nullsLast().op('text_ops')
		),
		uniqueIndex('apikey_access_unique').using(
			'btree',
			table.apikeyId.asc().nullsLast().op('text_ops'),
			table.resourceType.asc().nullsLast(),
			table.resourceId.asc().nullsLast().op('text_ops')
		),
	]
);
export const organization = pgTable(
	'organization',
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		slug: text(),
		logo: text(),
		createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
		metadata: text(),
	},
	(table) => [
		unique('organizations_slug_unique').on(table.slug),
		index('organizations_slug_idx').using(
			'btree',
			table.slug.asc().nullsLast().op('text_ops')
		),
	]
);

export const abTestStatus = pgEnum('ab_test_status', [
	'draft',
	'running',
	'paused',
	'completed',
]);

export const abVariantType = pgEnum('ab_variant_type', [
	'visual',
	'redirect',
	'code',
]);

export const abExperiments = pgTable(
	'ab_experiments',
	{
		id: text().primaryKey().notNull(),
		websiteId: text().notNull(),
		name: text().notNull(),
		description: text(),
		status: abTestStatus().default('draft').notNull(),
		trafficAllocation: integer().default(100).notNull(),
		startDate: timestamp({ precision: 3, mode: 'string' }),
		endDate: timestamp({ precision: 3, mode: 'string' }),
		primaryGoal: text(),
		createdBy: text().notNull(),
		createdAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		deletedAt: timestamp({ precision: 3, mode: 'string' }),
	},
	(table) => [
		index('ab_experiments_websiteId_idx').using(
			'btree',
			table.websiteId.asc().nullsLast()
		),
		index('ab_experiments_createdBy_idx').using(
			'btree',
			table.createdBy.asc().nullsLast()
		),
		index('ab_experiments_status_idx').using(
			'btree',
			table.status.asc().nullsLast()
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: 'ab_experiments_websiteId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: 'ab_experiments_createdBy_fkey',
		})
			.onUpdate('cascade')
			.onDelete('restrict'),
	]
);

export const abVariants = pgTable(
	'ab_variants',
	{
		id: text().primaryKey().notNull(),
		experimentId: text().notNull(),
		name: text().notNull(),
		type: abVariantType().default('visual').notNull(),
		content: jsonb().notNull(),
		trafficWeight: integer().default(50).notNull(),
		isControl: boolean().default(false).notNull(),
		createdAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
	},
	(table) => [
		index('ab_variants_experimentId_idx').using(
			'btree',
			table.experimentId.asc().nullsLast()
		),
		foreignKey({
			columns: [table.experimentId],
			foreignColumns: [abExperiments.id],
			name: 'ab_variants_experimentId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	]
);

export const abGoals = pgTable(
	'ab_goals',
	{
		id: text().primaryKey().notNull(),
		experimentId: text().notNull(),
		name: text().notNull(),
		type: text().notNull(),
		target: text().notNull(),
		description: text(),
		createdAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: timestamp({ precision: 3, mode: 'string' })
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
	},
	(table) => [
		index('ab_goals_experimentId_idx').using(
			'btree',
			table.experimentId.asc().nullsLast()
		),
		foreignKey({
			columns: [table.experimentId],
			foreignColumns: [abExperiments.id],
			name: 'ab_goals_experimentId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	]
);
