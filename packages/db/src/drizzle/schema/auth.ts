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

export type EmailAlertMode = "off" | "critical_only" | "warnings_and_critical";

export type TrackingAlertBlockReason =
	| "origin_not_authorized"
	| "origin_missing"
	| "ip_not_authorized";

export type TrackingAlertKind = "blocked_spike" | "tracking_zero";

export interface OrganizationEmailNotificationSettings {
	billing?: {
		usageWarnings?: boolean;
	};
	trackingHealth?: {
		cooldownMinutes?: number;
		ignoredOrigins?: string[];
		ignoredReasons?: TrackingAlertBlockReason[];
		mode?: EmailAlertMode;
	};
	uptime?: {
		downEmails?: boolean;
		recoveryEmails?: boolean;
	};
}

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
		emailNotifications: jsonb("email_notifications")
			.$type<OrganizationEmailNotificationSettings>()
			.default({})
			.notNull(),
	},
	(table) => [unique("organizations_slug_unique").on(table.slug)]
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
		verified: boolean().default(true),
		failedVerificationCount: integer("failed_verification_count").default(0),
		lockedUntil: timestamp("locked_until", {
			precision: 3,
			withTimezone: true,
		}),
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

export const jwks = pgTable("jwks", {
	id: text().primaryKey().notNull(),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: timestamp("created_at", {
		precision: 3,
		withTimezone: true,
	}).notNull(),
	expiresAt: timestamp("expires_at", { precision: 3, withTimezone: true }),
	alg: text(),
	crv: text(),
});

export const oauthClient = pgTable(
	"oauth_client",
	{
		id: text().primaryKey().notNull(),
		clientId: text("client_id").notNull(),
		clientSecret: text("client_secret"),
		clientDiscoveryId: text("client_discovery_id"),
		disabled: boolean(),
		skipConsent: boolean("skip_consent"),
		enableEndSession: boolean("enable_end_session"),
		subjectType: text("subject_type"),
		scopes: jsonb(),
		clientCredentialsScopes: jsonb("client_credentials_scopes"),
		userId: text("user_id"),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true }),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true }),
		name: text(),
		uri: text(),
		icon: text(),
		contacts: jsonb(),
		tos: text(),
		policy: text(),
		softwareId: text("software_id"),
		softwareVersion: text("software_version"),
		softwareStatement: text("software_statement"),
		redirectUris: jsonb("redirect_uris").notNull(),
		postLogoutRedirectUris: jsonb("post_logout_redirect_uris"),
		backchannelLogoutUri: text("backchannel_logout_uri"),
		backchannelLogoutSessionRequired: boolean(
			"backchannel_logout_session_required"
		),
		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
		applicationType: text("application_type"),
		jwks: text(),
		jwksUri: text("jwks_uri"),
		grantTypes: jsonb("grant_types"),
		responseTypes: jsonb("response_types"),
		requirePKCE: boolean("require_pkce"),
		dpopBoundAccessTokens: boolean("dpop_bound_access_tokens"),
		referenceId: text("reference_id"),
		metadata: jsonb(),
	},
	(table) => [
		uniqueIndex("oauth_client_client_id_unique").using(
			"btree",
			table.clientId.asc().nullsLast().op("text_ops")
		),
		index("oauth_client_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "oauth_client_user_id_user_id_fk",
		}).onDelete("cascade"),
	]
);

export const oauthResource = pgTable(
	"oauth_resource",
	{
		id: text().primaryKey().notNull(),
		identifier: text().notNull(),
		name: text().notNull(),
		accessTokenTtl: integer("access_token_ttl"),
		refreshTokenTtl: integer("refresh_token_ttl"),
		signingAlgorithm: text("signing_algorithm"),
		signingKeyId: text("signing_key_id"),
		allowedScopes: jsonb("allowed_scopes"),
		customClaims: jsonb("custom_claims"),
		dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required"),
		disabled: boolean(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true }),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true }),
		policyVersion: integer("policy_version"),
		metadata: jsonb(),
	},
	(table) => [
		uniqueIndex("oauth_resource_identifier_unique").using(
			"btree",
			table.identifier.asc().nullsLast().op("text_ops")
		),
	]
);

export const oauthClientResource = pgTable(
	"oauth_client_resource",
	{
		id: text().primaryKey().notNull(),
		clientId: text("client_id").notNull(),
		resourceId: text("resource_id").notNull(),
		metadata: jsonb(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true }),
	},
	(table) => [
		index("oauth_client_resource_client_id_idx").using(
			"btree",
			table.clientId.asc().nullsLast().op("text_ops")
		),
		index("oauth_client_resource_resource_id_idx").using(
			"btree",
			table.resourceId.asc().nullsLast().op("text_ops")
		),
		uniqueIndex("oauth_client_resource_client_resource_unique").using(
			"btree",
			table.clientId.asc().nullsLast().op("text_ops"),
			table.resourceId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "oauth_client_resource_client_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.resourceId],
			foreignColumns: [oauthResource.identifier],
			name: "oauth_client_resource_resource_id_fk",
		}).onDelete("cascade"),
	]
);

export const oauthRefreshToken = pgTable(
	"oauth_refresh_token",
	{
		id: text().primaryKey().notNull(),
		token: text().notNull(),
		clientId: text("client_id").notNull(),
		sessionId: text("session_id"),
		userId: text("user_id").notNull(),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: jsonb(),
		requestedUserInfoClaims: jsonb("requested_user_info_claims"),
		expiresAt: timestamp("expires_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		createdAt: timestamp("created_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		revoked: timestamp({ precision: 3, withTimezone: true }),
		rotatedAt: timestamp("rotated_at", { precision: 3, withTimezone: true }),
		rotationReplayResponse: text("rotation_replay_response"),
		rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", {
			precision: 3,
			withTimezone: true,
		}),
		authTime: timestamp("auth_time", { precision: 3, withTimezone: true }),
		confirmation: jsonb(),
		scopes: jsonb().notNull(),
	},
	(table) => [
		uniqueIndex("oauth_refresh_token_token_unique").using(
			"btree",
			table.token.asc().nullsLast().op("text_ops")
		),
		index("oauth_refresh_token_client_id_idx").using(
			"btree",
			table.clientId.asc().nullsLast().op("text_ops")
		),
		index("oauth_refresh_token_session_id_idx").using(
			"btree",
			table.sessionId.asc().nullsLast().op("text_ops")
		),
		index("oauth_refresh_token_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		index("oauth_refresh_token_authorization_code_id_idx").using(
			"btree",
			table.authorizationCodeId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "oauth_refresh_token_client_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.sessionId],
			foreignColumns: [session.id],
			name: "oauth_refresh_token_session_id_fk",
		}).onDelete("set null"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "oauth_refresh_token_user_id_fk",
		}).onDelete("cascade"),
	]
);

export const oauthAccessToken = pgTable(
	"oauth_access_token",
	{
		id: text().primaryKey().notNull(),
		token: text().notNull(),
		clientId: text("client_id").notNull(),
		sessionId: text("session_id"),
		userId: text("user_id"),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: jsonb(),
		requestedUserInfoClaims: jsonb("requested_user_info_claims"),
		refreshId: text("refresh_id"),
		expiresAt: timestamp("expires_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		createdAt: timestamp("created_at", {
			precision: 3,
			withTimezone: true,
		}).notNull(),
		revoked: timestamp({ precision: 3, withTimezone: true }),
		confirmation: jsonb(),
		scopes: jsonb().notNull(),
	},
	(table) => [
		uniqueIndex("oauth_access_token_token_unique").using(
			"btree",
			table.token.asc().nullsLast().op("text_ops")
		),
		index("oauth_access_token_client_id_idx").using(
			"btree",
			table.clientId.asc().nullsLast().op("text_ops")
		),
		index("oauth_access_token_session_id_idx").using(
			"btree",
			table.sessionId.asc().nullsLast().op("text_ops")
		),
		index("oauth_access_token_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		index("oauth_access_token_authorization_code_id_idx").using(
			"btree",
			table.authorizationCodeId.asc().nullsLast().op("text_ops")
		),
		index("oauth_access_token_refresh_id_idx").using(
			"btree",
			table.refreshId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "oauth_access_token_client_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.sessionId],
			foreignColumns: [session.id],
			name: "oauth_access_token_session_id_fk",
		}).onDelete("set null"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "oauth_access_token_user_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.refreshId],
			foreignColumns: [oauthRefreshToken.id],
			name: "oauth_access_token_refresh_id_fk",
		}).onDelete("cascade"),
	]
);

export const oauthConsent = pgTable(
	"oauth_consent",
	{
		id: text().primaryKey().notNull(),
		clientId: text("client_id").notNull(),
		userId: text("user_id"),
		referenceId: text("reference_id"),
		resources: jsonb(),
		requestedUserInfoClaims: jsonb("requested_user_info_claims"),
		scopes: jsonb().notNull(),
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
		index("oauth_consent_client_id_idx").using(
			"btree",
			table.clientId.asc().nullsLast().op("text_ops")
		),
		index("oauth_consent_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("text_ops")
		),
		foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "oauth_consent_client_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "oauth_consent_user_id_fk",
		}).onDelete("cascade"),
	]
);

export const oauthClientAssertion = pgTable("oauth_client_assertion", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp("expires_at", {
		precision: 3,
		withTimezone: true,
	}).notNull(),
});

export type User = typeof user.$inferSelect;
export type UserInsert = typeof user.$inferInsert;
export type Organization = typeof organization.$inferSelect;
export type OrganizationInsert = typeof organization.$inferInsert;
