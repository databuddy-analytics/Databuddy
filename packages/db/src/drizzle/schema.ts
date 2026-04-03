import { isNotNull } from "drizzle-orm";
import {
	boolean,
	doublePrecision,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
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
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			precision: 3,
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
			precision: 3,
			withTimezone: true,
		}),
		scope: text(),
		password: text(),
		createdAt: timestamp("created_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		updatedAt: timestamp("updated_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
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
		expiresAt: timestamp({
			precision: 3,
			mode: "string",
			withTimezone: true,
		}).notNull(),
		token: text().notNull(),
		createdAt: timestamp({ precision: 3, mode: "string", withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp({
			precision: 3,
			mode: "string",
			withTimezone: true,
		}).notNull(),
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
		expiresAt: timestamp("expires_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.notNull()
			.defaultNow(),
		inviterId: text("inviter_id").notNull(),
	},
	(table) => [
		index("idx_invitation_email_status_expires").using(
			"btree",
			table.email.asc().nullsLast().op("text_ops"),
			table.status.asc().nullsLast().op("text_ops"),
			table.expiresAt.asc().nullsLast()
		),
		index("idx_invitation_org_expires").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops"),
			table.expiresAt.desc().nullsLast()
		),
		index("idx_invitation_inviter_id").using(
			"btree",
			table.inviterId.asc().nullsLast().op("text_ops")
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
		createdAt: timestamp("created_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
	},
	(table) => [
		index("idx_member_org_user").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops"),
			table.userId.asc().nullsLast().op("text_ops")
		),
		index("members_userId_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
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
		expiresAt: timestamp("expires_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true }),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true }),
	},
	(table) => [
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
		index("idx_two_factor_user_id").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
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
		index("idx_sso_provider_user_id").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
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
		createdAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp({ precision: 3, withTimezone: true }).notNull(),
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

export interface WebsiteSettings {
	allowedIps?: string[];
	allowedOrigins?: string[];
}

export const websites = pgTable(
	"websites",
	{
		id: text().primaryKey().notNull(),
		domain: text().notNull(),
		name: text(),
		status: websiteStatus().default("ACTIVE").notNull(),
		isPublic: boolean().default(false).notNull(),
		createdAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		deletedAt: timestamp({ precision: 3 }),
		organizationId: text("organization_id").notNull(),
		integrations: jsonb().$type<Record<string, unknown>>(),
		settings: jsonb().$type<WebsiteSettings>(),
	},
	(table) => [
		uniqueIndex("websites_org_domain_unique").on(
			table.organizationId,
			table.domain
		),
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
		createdAt: timestamp("created_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		updatedAt: timestamp("updated_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		deletedAt: timestamp({ precision: 3, mode: "string" }),
		role: role().default("USER").notNull(),
		twoFactorEnabled: boolean("two_factor_enabled"),
	},
	(table) => [unique("users_email_unique").on(table.email)]
);

export interface DataFilter {
	field: string;
	operator: "equals" | "contains" | "not_equals" | "in" | "not_in";
	value: string | string[];
}

export interface FunnelStep {
	conditions?: Record<string, unknown>;
	name: string;
	target: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
}

export const funnelDefinitions = pgTable(
	"funnel_definitions",
	{
		id: text().primaryKey().notNull(),
		websiteId: text().notNull(),
		name: text().notNull(),
		description: text(),
		steps: jsonb().$type<FunnelStep[]>().notNull(),
		filters: jsonb().$type<DataFilter[]>(),
		ignoreHistoricData: boolean().default(false).notNull(),
		isActive: boolean().default(true).notNull(),
		createdBy: text().notNull(),
		createdAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		deletedAt: timestamp({ precision: 3 }),
	},
	(table) => [
		index("funnel_definitions_website_id_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		index("idx_funnel_definitions_createdBy").using(
			"btree",
			table.createdBy.asc().nullsLast().op("text_ops")
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
		filters: jsonb().$type<DataFilter[]>(),
		ignoreHistoricData: boolean().default(false).notNull(),
		isActive: boolean().default(true).notNull(),
		createdBy: text().notNull(),
		createdAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp({ precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		deletedAt: timestamp({ precision: 3 }),
	},
	(table) => [
		index("goals_website_id_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		index("idx_goals_createdBy").using(
			"btree",
			table.createdBy.asc().nullsLast().op("text_ops")
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
		createdAt: timestamp("created_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true }),
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
	"write:llm",
	"write:data",
	"read:analytics",
	"write:custom-sql",
	"read:export",
	"write:otel",
	"admin:apikeys",
	"admin:users",
	"admin:organizations",
	"admin:websites",
	"rate:standard",
	"rate:premium",
	"rate:enterprise",
	"read:experiments",
	"track:events",
	"read:links",
	"write:links",
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

export interface ApiKeyMetadata {
	description?: string;
	lastUsedAt?: string;
	resources?: Record<string, string[]>;
	tags?: string[];
}

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
		metadata: jsonb("metadata").$type<ApiKeyMetadata>().default({}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("apikey_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		index("apikey_organization_id_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
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
	]
);

export const organization = pgTable(
	"organization",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		slug: text(),
		logo: text(),
		createdAt: timestamp("created_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		metadata: text(),
	},
	(table) => [unique("organizations_slug_unique").on(table.slug)]
);

export const dbPermissionLevel = pgEnum("db_permission_level", [
	"readonly",
	"admin",
]);

export const flagType = pgEnum("flag_type", [
	"boolean",
	"rollout",
	"multivariant",
]);

export const flagStatus = pgEnum("flag_status", [
	"active",
	"inactive",
	"archived",
]);
export const annotationType = pgEnum("annotation_type", [
	"point",
	"line",
	"range",
]);

export const chartType = pgEnum("chart_type", ["metrics"]);

export interface FlagUserRule {
	batch: boolean;
	batchValues?: string[];
	enabled: boolean;
	field?: string;
	operator:
		| "equals"
		| "contains"
		| "starts_with"
		| "ends_with"
		| "in"
		| "not_in"
		| "exists"
		| "not_exists";
	type: "user_id" | "email" | "property";
	value?: string;
	values?: string[];
}

export interface FlagVariant {
	description?: string;
	key: string;
	type: "string" | "number" | "json";
	value: string | number;
	weight?: number;
}

export const flags = pgTable(
	"flags",
	{
		id: text().primaryKey().notNull(),
		key: text().notNull(),
		name: text(),
		description: text(),
		type: flagType().default("boolean").notNull(),
		status: flagStatus().default("active").notNull(),
		defaultValue: jsonb("default_value")
			.$type<boolean>()
			.default(false)
			.notNull(),
		payload: jsonb("payload").$type<Record<string, unknown>>(),
		rules: jsonb("rules").$type<FlagUserRule[]>().default([]),
		persistAcrossAuth: boolean("persist_across_auth").default(false).notNull(),
		rolloutPercentage: integer("rollout_percentage").default(0),
		rolloutBy: text("rollout_by"),
		websiteId: text("website_id"),
		organizationId: text("organization_id"),
		userId: text("user_id"),
		createdBy: text("created_by").notNull(),
		variants: jsonb("variants").$type<FlagVariant[]>().default([]),
		dependencies: text("dependencies").array(),
		targetGroupIds: text("target_group_ids").array(),
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
		index("idx_flags_created_by").using(
			"btree",
			table.createdBy.asc().nullsLast().op("text_ops")
		),
		index("idx_flags_website_active").on(table.websiteId, table.status),
		index("idx_flags_org_active").on(table.organizationId, table.status),
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

export interface AnnotationChartContext {
	dateRange: {
		start_date: string;
		end_date: string;
		granularity: "hourly" | "daily" | "weekly" | "monthly";
	};
	filters?: Array<{
		field: string;
		operator: "eq" | "ne" | "gt" | "lt" | "contains";
		value: string;
	}>;
	metrics?: string[];
	tabId?: string;
}

export const annotations = pgTable(
	"annotations",
	{
		id: text().primaryKey().notNull(),
		websiteId: text("website_id").notNull(),
		chartType: chartType("chart_type").notNull(),
		chartContext: jsonb("chart_context")
			.$type<AnnotationChartContext>()
			.notNull(),
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
		index("idx_annotations_created_by").using(
			"btree",
			table.createdBy.asc().nullsLast().op("text_ops")
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

export const analyticsInsights = pgTable(
	"analytics_insights",
	{
		id: text().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		websiteId: text("website_id").notNull(),
		runId: text("run_id").notNull(),
		title: text().notNull(),
		description: text().notNull(),
		suggestion: text().notNull(),
		severity: text("severity").notNull(),
		sentiment: text("sentiment").notNull(),
		type: text("type").notNull(),
		priority: integer("priority").notNull(),
		changePercent: doublePrecision("change_percent"),
		metrics:
			jsonb("metrics").$type<
				Array<{
					label: string;
					current: number;
					previous?: number;
					format: "number" | "percent" | "duration_ms" | "duration_s";
				}>
			>(),
		timezone: text("timezone").notNull().default("UTC"),
		currentPeriodFrom: text("current_period_from").notNull(),
		currentPeriodTo: text("current_period_to").notNull(),
		previousPeriodFrom: text("previous_period_from").notNull(),
		previousPeriodTo: text("previous_period_to").notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(table) => [
		index("idx_analytics_insights_org_created").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops"),
			table.createdAt.desc().nullsLast()
		),
		index("idx_analytics_insights_website_created").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops"),
			table.createdAt.desc().nullsLast()
		),
		index("idx_analytics_insights_run").using(
			"btree",
			table.runId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "analytics_insights_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "analytics_insights_website_id_fkey",
		}).onDelete("cascade"),
	]
);

export const targetGroups = pgTable(
	"target_groups",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		description: text(),
		color: text().default("#6366f1").notNull(),
		rules: jsonb("rules").default([]).notNull(),
		websiteId: text("website_id").notNull(),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { precision: 3 }),
	},
	(table) => [
		index("target_groups_website_id_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		index("idx_target_groups_created_by").using(
			"btree",
			table.createdBy.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "target_groups_website_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "target_groups_created_by_fkey",
		})
			.onUpdate("cascade")
			.onDelete("restrict"),
	]
);

export const flagsToTargetGroups = pgTable(
	"flags_to_target_groups",
	{
		flagId: text("flag_id")
			.notNull()
			.references(() => flags.id, { onDelete: "cascade" }),
		targetGroupId: text("target_group_id")
			.notNull()
			.references(() => targetGroups.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.flagId, table.targetGroupId] }),
		index("flags_to_target_groups_target_group_id_idx").using(
			"btree",
			table.targetGroupId.asc().nullsLast()
		),
	]
);

export const uptimeSchedules = pgTable(
	"uptime_schedules",
	{
		id: text().primaryKey().notNull(),
		websiteId: text("website_id"),
		organizationId: text("organization_id").notNull(),
		url: text().notNull(),
		name: text(),
		granularity: text("granularity").notNull(),
		cron: text().notNull(),
		isPaused: boolean("is_paused").default(false).notNull(),
		isPublic: boolean("is_public").default(false).notNull(),
		timeout: integer(),
		cacheBust: boolean("cache_bust").default(false).notNull(),
		jsonParsingConfig: jsonb("json_parsing_config"),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
	},
	(table) => [
		index("uptime_schedules_website_id_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		index("uptime_schedules_organization_id_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "uptime_schedules_website_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "uptime_schedules_organization_id_organization_id_fk",
		}).onDelete("cascade"),
	]
);

export const statusPages = pgTable(
	"status_pages",
	{
		id: text().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		slug: text().notNull(),
		name: text().notNull(),
		description: text(),
		logoUrl: text("logo_url"),
		faviconUrl: text("favicon_url"),
		websiteUrl: text("website_url"),
		supportUrl: text("support_url"),
		theme: text().$type<"system" | "light" | "dark">().default("system"),
		hideBranding: boolean("hide_branding").default(false).notNull(),
		customCss: text("custom_css"),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
	},
	(table) => [
		index("status_pages_organization_id_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		uniqueIndex("status_pages_slug_unique").using(
			"btree",
			table.slug.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "status_pages_organization_id_fkey",
		}).onDelete("cascade"),
	]
);

export const statusPageMonitors = pgTable(
	"status_page_monitors",
	{
		id: text().primaryKey().notNull(),
		statusPageId: text("status_page_id").notNull(),
		uptimeScheduleId: text("uptime_schedule_id").notNull(),
		displayName: text("display_name"),
		order: integer().default(0).notNull(),
		hideUrl: boolean("hide_url").default(false).notNull(),
		hideUptimePercentage: boolean("hide_uptime_percentage")
			.default(false)
			.notNull(),
		hideLatency: boolean("hide_latency").default(false).notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("status_page_monitors_status_page_id_idx").using(
			"btree",
			table.statusPageId.asc().nullsLast().op("text_ops")
		),
		index("status_page_monitors_uptime_schedule_id_idx").using(
			"btree",
			table.uptimeScheduleId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.statusPageId],
			foreignColumns: [statusPages.id],
			name: "status_page_monitors_status_page_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.uptimeScheduleId],
			foreignColumns: [uptimeSchedules.id],
			name: "status_page_monitors_uptime_schedule_id_fkey",
		}).onDelete("cascade"),
	]
);

export const links = pgTable(
	"links",
	{
		id: text().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		createdBy: text("created_by").notNull(),
		slug: text().notNull(),
		name: text().notNull(),
		targetUrl: text("target_url").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		expiredRedirectUrl: text("expired_redirect_url"),
		ogTitle: text("og_title"),
		ogDescription: text("og_description"),
		ogImageUrl: text("og_image_url"),
		ogVideoUrl: text("og_video_url"),
		iosUrl: text("ios_url"),
		androidUrl: text("android_url"),
		externalId: text("external_id"),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("links_organization_id_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		index("links_created_by_idx").using(
			"btree",
			table.createdBy.asc().nullsLast().op("text_ops")
		),
		index("links_external_id_idx").using(
			"btree",
			table.externalId.asc().nullsLast().op("text_ops")
		),
		uniqueIndex("links_slug_unique").using(
			"btree",
			table.slug.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "links_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "links_created_by_fkey",
		}).onDelete("cascade"),
	]
);

export const usageAlertLog = pgTable(
	"usage_alert_log",
	{
		id: text().primaryKey().notNull(),
		userId: text("user_id").notNull(),
		featureId: text("feature_id").notNull(),
		alertType: text("alert_type").notNull(),
		emailSentTo: text("email_sent_to").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("usage_alert_log_user_feature_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops"),
			table.featureId.asc().nullsLast().op("text_ops")
		),
		index("usage_alert_log_created_at_idx").using(
			"btree",
			table.createdAt.asc().nullsLast()
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "usage_alert_log_user_id_fkey",
		}).onDelete("cascade"),
	]
);

export const revenueConfig = pgTable(
	"revenue_config",
	{
		id: text().primaryKey().notNull(),
		ownerId: text("owner_id").notNull(),
		websiteId: text("website_id"),
		webhookHash: text("webhook_hash").notNull(),
		stripeWebhookSecret: text("stripe_webhook_secret"),
		paddleWebhookSecret: text("paddle_webhook_secret"),
		currency: text().default("USD").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("revenue_config_webhook_hash_unique").using(
			"btree",
			table.webhookHash.asc().nullsLast().op("text_ops")
		),
		uniqueIndex("revenue_config_owner_website_unique").on(
			table.ownerId,
			table.websiteId
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "revenue_config_website_id_fkey",
		}).onDelete("cascade"),
	]
);

export const feedbackCategory = pgEnum("feedback_category", [
	"bug_report",
	"feature_request",
	"ux_improvement",
	"performance",
	"documentation",
	"other",
]);

export const feedbackStatus = pgEnum("feedback_status", [
	"pending",
	"approved",
	"rejected",
]);

export const insightFeedbackVoteEnum = pgEnum("insight_feedback_vote", [
	"up",
	"down",
]);

export const feedback = pgTable(
	"feedback",
	{
		id: text().primaryKey().notNull(),
		userId: text("user_id").notNull(),
		organizationId: text("organization_id").notNull(),
		title: text().notNull(),
		description: text().notNull(),
		category: feedbackCategory().notNull(),
		status: feedbackStatus().default("pending").notNull(),
		creditsAwarded: integer("credits_awarded").default(0).notNull(),
		adminNotes: text("admin_notes"),
		reviewedBy: text("reviewed_by"),
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("feedback_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		index("feedback_organization_id_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		index("feedback_status_idx").using("btree", table.status.asc().nullsLast()),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "feedback_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "feedback_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [user.id],
			name: "feedback_reviewed_by_fkey",
		}).onDelete("set null"),
	]
);

export const feedbackRedemptions = pgTable(
	"feedback_redemptions",
	{
		id: text().primaryKey().notNull(),
		userId: text("user_id").notNull(),
		organizationId: text("organization_id").notNull(),
		creditsSpent: integer("credits_spent").notNull(),
		rewardType: text("reward_type").notNull(),
		rewardAmount: integer("reward_amount").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("feedback_redemptions_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		index("feedback_redemptions_organization_id_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "feedback_redemptions_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "feedback_redemptions_organization_id_fkey",
		}).onDelete("cascade"),
	]
);

export const insightUserFeedback = pgTable(
	"insight_user_feedback",
	{
		id: text().primaryKey().notNull(),
		userId: text("user_id").notNull(),
		organizationId: text("organization_id").notNull(),
		insightId: text("insight_id").notNull(),
		vote: insightFeedbackVoteEnum().notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("insight_user_feedback_user_org_insight_uidx").on(
			table.userId,
			table.organizationId,
			table.insightId
		),
		index("insight_user_feedback_organization_id_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "insight_user_feedback_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "insight_user_feedback_organization_id_fkey",
		}).onDelete("cascade"),
	]
);

export const alarms = pgTable(
	"alarms",
	{
		id: text().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		websiteId: text("website_id"),
		name: text().notNull(),
		description: text(),
		enabled: boolean().notNull().default(true),
		triggerType: text("trigger_type").notNull(),
		triggerConditions: jsonb("trigger_conditions")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("alarms_organization_id_idx").using(
			"btree",
			table.organizationId.asc().nullsLast().op("text_ops")
		),
		index("alarms_website_id_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		index("alarms_org_enabled_idx").on(table.organizationId, table.enabled),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "alarms_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "alarms_website_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),
	]
);

export const alarmDestinations = pgTable(
	"alarm_destinations",
	{
		id: text().primaryKey().notNull(),
		alarmId: text("alarm_id").notNull(),
		type: text("type").notNull(),
		/** Webhook URL, email address, Telegram chat id, etc.; may be empty when `config` holds all fields */
		identifier: text("identifier").notNull().default(""),
		/** Extra fields (e.g. Telegram `botToken`, webhook headers, multiple emails) */
		config: jsonb("config")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("alarm_destinations_type_idx").using(
			"btree",
			table.type.asc().nullsLast().op("text_ops")
		),
		uniqueIndex("alarm_destinations_alarm_type_identifier_unique").using(
			"btree",
			table.alarmId.asc().nullsLast().op("text_ops"),
			table.type.asc().nullsLast().op("text_ops"),
			table.identifier.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.alarmId],
			foreignColumns: [alarms.id],
			name: "alarm_destinations_alarm_id_fkey",
		}).onDelete("cascade"),
	]
);

export const featureInvite = pgTable(
	"feature_invite",
	{
		id: text().primaryKey().notNull(),
		flagKey: text("flag_key").notNull(),
		token: text().notNull(),
		status: text().default("active").notNull(),
		invitedById: text("invited_by_id").notNull(),
		redeemedById: text("redeemed_by_id"),
		redeemedAt: timestamp("redeemed_at"),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("feature_invite_token_idx").on(table.token),
		index("feature_invite_flag_inviter_idx").on(
			table.flagKey,
			table.invitedById
		),
		foreignKey({
			columns: [table.invitedById],
			foreignColumns: [user.id],
			name: "feature_invite_inviter_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.redeemedById],
			foreignColumns: [user.id],
			name: "feature_invite_redeemer_fk",
		}).onDelete("set null"),
	]
);

export const featureAccessLog = pgTable(
	"feature_access_log",
	{
		id: text().primaryKey().notNull(),
		flagKey: text("flag_key").notNull(),
		actionType: text("action_type").notNull(),
		actorId: text("actor_id"),
		targetEmail: text("target_email").notNull(),
		organizationId: text("organization_id").notNull(),
		metadata: jsonb().$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("feature_access_log_flag_idx").on(table.flagKey),
		index("feature_access_log_org_idx").on(table.organizationId),
		index("feature_access_log_created_idx").on(table.createdAt),
	]
);

export type FeatureInvite = typeof featureInvite.$inferSelect;
export type FeatureInviteInsert = typeof featureInvite.$inferInsert;
export type FeatureAccessLog = typeof featureAccessLog.$inferSelect;
export type FeatureAccessLogInsert = typeof featureAccessLog.$inferInsert;

export type Website = typeof websites.$inferSelect;
export type WebsiteInsert = typeof websites.$inferInsert;
export type Organization = typeof organization.$inferSelect;
export type OrganizationInsert = typeof organization.$inferInsert;
export type User = typeof user.$inferSelect;
export type UserInsert = typeof user.$inferInsert;
export type Link = typeof links.$inferSelect;
export type LinkInsert = typeof links.$inferInsert;
export type UptimeSchedules = typeof uptimeSchedules.$inferSelect;
export type UptimeSchedulesInsert = typeof uptimeSchedules.$inferInsert;

export type StatusPages = typeof statusPages.$inferSelect;
export type StatusPagesInsert = typeof statusPages.$inferInsert;

export type StatusPageMonitors = typeof statusPageMonitors.$inferSelect;
export type StatusPageMonitorsInsert = typeof statusPageMonitors.$inferInsert;
export type RevenueConfig = typeof revenueConfig.$inferSelect;
export type RevenueConfigInsert = typeof revenueConfig.$inferInsert;
export type Flags = typeof flags.$inferSelect;
export type FlagsInsert = typeof flags.$inferInsert;
export type Annotations = typeof annotations.$inferSelect;
export type AnnotationsInsert = typeof annotations.$inferInsert;
export type AnalyticsInsight = typeof analyticsInsights.$inferSelect;
export type AnalyticsInsightInsert = typeof analyticsInsights.$inferInsert;
export type TargetGroups = typeof targetGroups.$inferSelect;
export type TargetGroupsInsert = typeof targetGroups.$inferInsert;
export type Feedback = typeof feedback.$inferSelect;
export type FeedbackInsert = typeof feedback.$inferInsert;
export type FeedbackRedemption = typeof feedbackRedemptions.$inferSelect;
export type FeedbackRedemptionInsert = typeof feedbackRedemptions.$inferInsert;
export type Alarm = typeof alarms.$inferSelect;
export type AlarmInsert = typeof alarms.$inferInsert;
export type AlarmDestination = typeof alarmDestinations.$inferSelect;
export type AlarmDestinationInsert = typeof alarmDestinations.$inferInsert;

/** Validate in Zod / RPC — not Postgres enums */
export const alarmTriggerTypeValues = [
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
] as const;
export type AlarmTriggerTypeValue = (typeof alarmTriggerTypeValues)[number];

export const alarmDestinationTypeValues = [
	"slack",
	"discord",
	"email",
	"webhook",
	"teams",
	"telegram",
	"google_chat",
] as const;
export type AlarmDestinationTypeValue =
	(typeof alarmDestinationTypeValues)[number];
