import { isNotNull, isNull } from "drizzle-orm";
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
} from "drizzle-orm/pg-core";

export const funnelStepType = pgEnum("FunnelStepType", [
	"PAGE_VIEW",
	"EVENT",
	"CUSTOM",
]);
export const memberRole = pgEnum("MemberRole", [
	"owner",
	"admin",
	"member",
	"viewer",
]);
export const organizationRole = pgEnum("OrganizationRole", [
	"admin",
	"owner",
	"member",
	"viewer",
]);

export const role = pgEnum("Role", [
	"ADMIN",
	"USER",
	"EARLY_ADOPTER",
	"INVESTOR",
	"BETA_TESTER",
	"GUEST",
]);

export const userStatus = pgEnum("UserStatus", [
	"ACTIVE",
	"SUSPENDED",
	"INACTIVE",
]);
export const verificationStatus = pgEnum("VerificationStatus", [
	"PENDING",
	"VERIFIED",
	"FAILED",
]);
export const websiteStatus = pgEnum("WebsiteStatus", [
	"ACTIVE",
	"HEALTHY",
	"UNHEALTHY",
	"INACTIVE",
	"PENDING",
]);

export const account = pgTable(
	"account",
	{
		id: text().primaryKey().notNull(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id").notNull(),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text(),
		password: text(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		index("accounts_userId_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		index("accounts_accountId_idx").using(
			"btree",
			table.accountId.asc().nullsLast().op("text_ops")
		),
		index("accounts_providerId_idx").using(
			"btree",
			table.providerId.asc().nullsLast().op("text_ops")
		),
		uniqueIndex("accounts_provider_account_unique").using(
			"btree",
			table.providerId.asc().nullsLast().op("text_ops"),
			table.accountId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk",
		}).onDelete("cascade"),
	]
);

export const session = pgTable(
	"session",
	{
		id: text().primaryKey().notNull(),
		expiresAt: timestamp({ precision: 3, mode: "string" }).notNull(),
		token: text().notNull(),
		createdAt: timestamp({ precision: 3, mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp({ precision: 3, mode: "string" }).notNull(),
		ipAddress: text(),
		userAgent: text(),
		userId: text(),
		activeOrganizationId: text("active_organization_id"),
	},
	(table) => [
		uniqueIndex("sessions_token_key").using(
			"btree",
			table.token.asc().nullsLast().op("text_ops")
		),
		index("sessions_userId_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_userId_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	]
);

export const invitation = pgTable(
	"invitation",
	{
		id: text().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		email: text().notNull(),
		role: text().default("member"),
		teamId: text("team_id"),
		status: text().default("pending").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		inviterId: text("inviter_id").notNull(),
	},
	(table) => [
		index("invitations_email_idx").using(
			"btree",
			table.email.asc().nullsLast().op("text_ops")
		),
		index("invitations_organizationId_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		index("invitations_teamId_idx").using(
			"btree",
			table.teamId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "invitation_organization_id_organization_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.inviterId],
			foreignColumns: [user.id],
			name: "invitation_inviter_id_user_id_fk",
		}).onDelete("cascade"),
	]
);

export const member = pgTable(
	"member",
	{
		id: text().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		userId: text("user_id").notNull(),
		role: text().default("member").notNull(),
		teamId: text("team_id"),
		createdAt: timestamp("created_at").notNull(),
	},
	(table) => [
		index("members_userId_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		index("members_organizationId_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "member_organization_id_organization_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "member_user_id_user_id_fk",
		}).onDelete("cascade"),
	]
);

export const verification = pgTable(
	"verification",
	{
		id: text().primaryKey().notNull(),
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at"),
		updatedAt: timestamp("updated_at"),
	},
	(table) => [
		index("verifications_identifier_idx").using(
			"btree",
			table.identifier.asc().nullsLast().op("text_ops")
		),
		index("verifications_expiresAt_idx").using(
			"btree",
			table.expiresAt.asc().nullsLast()
		),
	]
);

export const twoFactor = pgTable(
	"two_factor",
	{
		id: text().primaryKey().notNull(),
		secret: text().notNull(),
		backupCodes: text("backup_codes").notNull(),
		userId: text("user_id").notNull(),
	},
	(table) => [
		index("twoFactor_secret_idx").using(
			"btree",
			table.secret.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "two_factor_user_id_user_id_fk",
		}).onDelete("cascade"),
	]
);

export const ssoProvider = pgTable(
	"sso_provider",
	{
		id: text().primaryKey().notNull(),
		issuer: text().notNull(),
		oidcConfig: text("oidc_config"),
		samlConfig: text("saml_config"),
		userId: text("user_id"),
		providerId: text("provider_id").notNull(),
		organizationId: text("organization_id"),
		domain: text().notNull(),
		domainVerified: boolean("domain_verified"),
	},
	(table) => [
		uniqueIndex("sso_provider_provider_id_unique").using(
			"btree",
			table.providerId.asc().nullsLast().op("text_ops")
		),
		index("sso_provider_organization_id_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		index("sso_provider_domain_idx").using(
			"btree",
			table.domain.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "sso_provider_user_id_user_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "sso_provider_organization_id_organization_id_fk",
		}).onDelete("cascade"),
	]
);

export const userPreferences = pgTable(
	"user_preferences",
	{
		id: text().primaryKey().notNull(),
		userId: text().notNull(),
		timezone: text().default("auto").notNull(),
		dateFormat: text().default("MMM D, YYYY").notNull(),
		timeFormat: text().default("h:mm a").notNull(),
		createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
		updatedAt: timestamp({ precision: 3 }).notNull(),
	},
	(table) => [
		uniqueIndex("user_preferences_userId_key").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "user_preferences_userId_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	]
);

export const websites = pgTable(
	"websites",
	{
		id: text().primaryKey().notNull(),
		domain: text().notNull(),
		name: text(),
		status: websiteStatus().default("ACTIVE").notNull(),
		userId: text(),
		isPublic: boolean().default(false).notNull(),
		createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
		updatedAt: timestamp({ precision: 3 }).defaultNow().notNull(),
		deletedAt: timestamp({ precision: 3 }),
		organizationId: text("organization_id"),
		integrations: jsonb(),
	},
	(table) => [
		uniqueIndex("websites_user_domain_unique")
			.on(table.userId, table.domain)
			.where(isNull(table.organizationId)),
		uniqueIndex("websites_org_domain_unique")
			.on(table.organizationId, table.domain)
			.where(isNotNull(table.organizationId)),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "websites_userId_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "websites_organization_id_organization_id_fk",
		}).onDelete("cascade"),
	]
);

export const user = pgTable(
	"user",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		email: text().notNull(),
		emailVerified: boolean("email_verified").notNull(),
		image: text(),
		firstName: text(),
		lastName: text(),
		status: userStatus().default("ACTIVE").notNull(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		deletedAt: timestamp({ precision: 3, mode: "string" }),
		role: role().default("USER").notNull(),
		twoFactorEnabled: boolean("two_factor_enabled"),
	},
	(table) => [
		unique("users_email_unique").on(table.email),
		index("users_emailVerified_idx").using(
			"btree",
			table.emailVerified.asc().nullsLast()
		),
	]
);

export const funnelDefinitions = pgTable(
	"funnel_definitions",
	{
		id: text().primaryKey().notNull(),
		websiteId: text().notNull(),
		name: text().notNull(),
		description: text(),
		steps: jsonb().notNull(),
		filters: jsonb(),
		ignoreHistoricData: boolean().default(false).notNull(),
		isActive: boolean().default(true).notNull(),
		createdBy: text().notNull(),
		createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
		updatedAt: timestamp({ precision: 3 }).defaultNow().notNull(),
		deletedAt: timestamp({ precision: 3 }),
	},
	(table) => [
		index("funnel_definitions_websiteId_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "funnel_definitions_websiteId_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "funnel_definitions_createdBy_fkey",
		})
			.onUpdate("cascade")
			.onDelete("restrict"),
	]
);

export const goals = pgTable(
	"goals",
	{
		id: text().primaryKey().notNull(),
		websiteId: text().notNull(),
		type: text().notNull(), // e.g., 'PAGE_VIEW', 'EVENT', 'CUSTOM'
		target: text().notNull(), // event name or page path
		name: text().notNull(),
		description: text(),
		filters: jsonb(),
		ignoreHistoricData: boolean().default(false).notNull(),
		isActive: boolean().default(true).notNull(),
		createdBy: text().notNull(),
		createdAt: timestamp({ precision: 3 }).defaultNow().notNull(),
		updatedAt: timestamp({ precision: 3 }).defaultNow().notNull(),
		deletedAt: timestamp({ precision: 3 }),
	},
	(table) => [
		index("goals_websiteId_deletedAt_createdAt_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops"),
			table.deletedAt.asc().nullsLast(),
			table.createdAt.desc().nullsLast()
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "goals_websiteId_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "goals_createdBy_fkey",
		})
			.onUpdate("cascade")
			.onDelete("restrict"),
	]
);

export const team = pgTable(
	"team",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		organizationId: text("organization_id").notNull(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at"),
	},
	(table) => [
		index("team_organizationId_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "team_organization_id_organization_id_fk",
		}).onDelete("cascade"),
	]
);

export const apiKeyType = pgEnum("api_key_type", ["user", "sdk", "automation"]);
export const apiScope = pgEnum("api_scope", [
	"read:data",
	"write:data",
	"read:experiments",
	"track:events",
	"admin:apikeys",
	// New scopes for core use cases
	"read:analytics",
	"write:custom-sql",
	"read:export",
	"write:otel",
	// Administrative scopes
	"admin:users",
	"admin:organizations",
	"admin:websites",
	// Rate limiting and usage scopes
	"rate:standard",
	"rate:premium",
	"rate:enterprise",
]);

// Resource type for flexible, future-proof per-resource access control
export const apiResourceType = pgEnum("api_resource_type", [
	"global",
	"website",
	"ab_experiment",
	"feature_flag",
	// New resource types for data categories
	"analytics_data",
	"error_data",
	"web_vitals",
	"custom_events",
	"export_data",
]);

export const apikey = pgTable(
	"apikey",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		prefix: text().notNull(),
		start: text().notNull(),
		keyHash: text("key_hash").notNull(),
		userId: text("user_id"),
		organizationId: text("organization_id"),
		type: apiKeyType("type").notNull().default("user"),
		scopes: apiScope("scopes").array().notNull().default([]),
		enabled: boolean("enabled").notNull().default(true),
		revokedAt: timestamp("revoked_at"),
		rateLimitEnabled: boolean("rate_limit_enabled").notNull().default(true),
		rateLimitTimeWindow: integer("rate_limit_time_window"),
		rateLimitMax: integer("rate_limit_max"),
		expiresAt: timestamp("expires_at", { mode: "string" }),
		metadata: jsonb("metadata").default({}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "apikey_user_id_user_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "apikey_organization_id_organization_id_fk",
		}).onDelete("cascade"),
		uniqueIndex("apikey_key_hash_unique").using(
			"btree",
			table.keyHash.asc().nullsLast().op("text_ops")
		),
		index("apikey_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		index("apikey_organization_id_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		index("apikey_prefix_idx").using(
			"btree",
			table.prefix.asc().nullsLast().op("text_ops")
		),
		index("apikey_enabled_idx").using("btree", table.enabled.asc().nullsLast()),
	]
);

export const organization = pgTable(
	"organization",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		slug: text(),
		logo: text(),
		createdAt: timestamp("created_at").notNull(),
		metadata: text(),
	},
	(table) => [unique("organizations_slug_unique").on(table.slug)]
);

export const assistantConversations = pgTable(
	"assistant_conversations",
	{
		id: text().primaryKey().notNull(),
		userId: text("user_id"),
		websiteId: text("website_id").notNull(),
		title: text(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("assistant_conversations_website_id_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "assistant_conversations_user_id_fkey",
		}).onDelete("set null"),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "assistant_conversations_website_id_fkey",
		}).onDelete("cascade"),
	]
);

export const assistantMessages = pgTable(
	"assistant_messages",
	{
		id: text().primaryKey().notNull(),
		conversationId: text("conversation_id").notNull(),
		role: text("role").notNull(),
		content: text("content"),
		modelType: text("model_type").notNull(),
		sql: text("sql"),
		chartType: text("chart_type"),
		responseType: text("response_type"),
		finalResult: jsonb("final_result"),
		textResponse: text("text_response"),
		thinkingSteps: text("thinking_steps").array(),
		hasError: boolean("has_error").default(false).notNull(),
		errorMessage: text("error_message"),
		upvotes: integer("upvotes").default(0).notNull(),
		downvotes: integer("downvotes").default(0).notNull(),
		feedbackComments: jsonb("feedback_comments"),
		aiResponseTime: integer("ai_response_time"),
		totalProcessingTime: integer("total_processing_time"),
		promptTokens: integer("prompt_tokens"),
		completionTokens: integer("completion_tokens"),
		totalTokens: integer("total_tokens"),
		debugLogs: text("debug_logs").array(),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("assistant_messages_conversation_id_idx").using(
			"btree",
			table.conversationId.asc().nullsLast().op("text_ops")
		),
		index("assistant_messages_createdAt_idx").using(
			"btree",
			table.createdAt.asc().nullsLast()
		),
		foreignKey({
			columns: [table.conversationId],
			foreignColumns: [assistantConversations.id],
			name: "assistant_messages_conversation_id_fkey",
		}).onDelete("cascade"),
	]
);

export const dbPermissionLevel = pgEnum("db_permission_level", [
	"readonly",
	"admin",
]);

export const flagType = pgEnum("flag_type", ["boolean", "rollout", "multivariant"]);

export const flagStatus = pgEnum("flag_status", [
	"active",
	"inactive",
	"archived",
]);
export const flagScheduleActionType = pgEnum("flag_schedule_type", [
	"enable",
	"disable",
	"update_rollout",
]);
export type RolloutStep =
	| { scheduledAt: string; action: "enable" | "disable"; executedAt?: string }
	| { scheduledAt: string; action: "set_percentage"; value: number; executedAt?: string };
export const annotationType = pgEnum("annotation_type", [
	"point",
	"line",
	"range",
]);

export const chartType = pgEnum("chart_type", ["metrics"]);

export const flags = pgTable(
	"flags",
	{
		id: text().primaryKey().notNull(),
		key: text().notNull(),
		name: text(),
		description: text(),
		type: flagType().default("boolean").notNull(),
		status: flagStatus().default("active").notNull(),
		defaultValue: jsonb("default_value").default(false).notNull(),
		payload: jsonb("payload"),
		rules: jsonb("rules").default([]),
		persistAcrossAuth: boolean("persist_across_auth").default(false).notNull(),
		rolloutPercentage: integer("rollout_percentage").default(0),
		websiteId: text("website_id"),
		organizationId: text("organization_id"),
		userId: text("user_id"),
		createdBy: text("created_by").notNull(),
		variants: jsonb("variants").default([]),
		dependencies: text("dependencies").array(),
		environment: text("environment"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		uniqueIndex("flags_key_website_unique")
			.on(table.key, table.websiteId)
			.where(isNotNull(table.websiteId)),
		uniqueIndex("flags_key_org_unique")
			.on(table.key, table.organizationId)
			.where(isNotNull(table.organizationId)),
		uniqueIndex("flags_key_user_unique")
			.on(table.key, table.userId)
			.where(isNotNull(table.userId)),
		index("flags_website_id_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "flags_website_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "flags_organization_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "flags_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "flags_created_by_fkey",
		})
			.onUpdate("cascade")
			.onDelete("restrict"),
	]
);

export const flagSchedules = pgTable(
	"flag_schedules",
	{
		id: text().primaryKey().notNull(),
		flagId: text("flag_id").notNull(),
		scheduledAt: timestamp("scheduled_at"),
		rolloutSteps: jsonb("rollout_steps").$type<
			{ scheduledAt: string; value: number | "enable" | "disable", executedAt?: string }[]
		>(),
		type: flagScheduleActionType().notNull(),
		isEnabled: boolean("is_enabled").default(false).notNull(),
		qstashScheduleIds: text("qstash_schedule_ids").array(),
		executedAt: timestamp("executed_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("idx_flag_schedules_flag_id").on(table.flagId),
		index("idx_flag_schedules_scheduled_at").on(table.scheduledAt),
		foreignKey({
			columns: [table.flagId],
			foreignColumns: [flags.id],
			name: "flag_schedules_flag_id_fkey",
		}).onDelete("cascade"),
	]
);

export const annotations = pgTable(
	"annotations",
	{
		id: text().primaryKey().notNull(),
		websiteId: text("website_id").notNull(),
		chartType: chartType("chart_type").notNull(),
		chartContext: jsonb("chart_context").notNull(),
		annotationType: annotationType("annotation_type").notNull(),
		xValue: timestamp("x_value", { precision: 3 }).notNull(),
		xEndValue: timestamp("x_end_value", { precision: 3 }),
		yValue: integer("y_value"),
		text: text().notNull(),
		tags: text("tags").array(),
		color: text().default("#3B82F6").notNull(),
		isPublic: boolean("is_public").default(false).notNull(),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { precision: 3 }),
	},
	(table) => [
		index("annotations_website_id_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "annotations_website_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "annotations_created_by_fkey",
		})
			.onUpdate("cascade")
			.onDelete("restrict"),
	]
);

export const uptimeSchedules = pgTable(
	"uptime_schedules",
	{
		id: text().primaryKey().notNull(),
		websiteId: text("website_id").notNull(),
		granularity: text("granularity").notNull(),
		cron: text().notNull(),
		isPaused: boolean("is_paused").default(false).notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
	},
	(table) => [
		index("uptime_schedules_website_id_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "uptime_schedules_website_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	]
);
