export type ApiScope =
	| "read:data"
	| "write:data"
	| "read:experiments"
	| "track:events"
	| "admin:apikeys"
	// New scopes for core use cases
	| "read:analytics"
	| "write:custom-sql"
	| "read:export"
	| "write:otel"
	// Administrative scopes
	| "admin:users"
	| "admin:organizations"
	| "admin:websites"
	// Rate limiting and usage scopes
	| "rate:standard"
	| "rate:premium"
	| "rate:enterprise";

export type ApiResourceType =
	| "global"
	| "website"
	| "ab_experiment"
	| "feature_flag"
	// New resource types for data categories
	| "analytics_data"
	| "error_data"
	| "web_vitals"
	| "custom_events"
	| "export_data";

export type ApiKeyAccessEntry = {
	resourceType: ApiResourceType;
	resourceId?: string | null;
	scopes: ApiScope[];
}

export type ApiKeyListItem = {
	id: string;
	name: string;
	prefix: string;
	start: string;
	type: "user" | "sdk" | "automation";
	enabled: boolean;
	revokedAt?: string | null;
	expiresAt?: string | null;
	scopes: ApiScope[];
	rateLimitEnabled?: boolean;
	rateLimitTimeWindow?: number | null;
	rateLimitMax?: number | null;
	createdAt: string;
	updatedAt: string;
	metadata?: Record<string, unknown>;
};

export interface ApiKeyDetail extends ApiKeyListItem {
	access: Array<{ id: string } & ApiKeyAccessEntry>;
}

export type CreateApiKeyInput = {
	name: string;
	organizationId?: string;
	type?: "user" | "sdk" | "automation";
	globalScopes?: ApiScope[];
	access?: ApiKeyAccessEntry[];
	rateLimitEnabled?: boolean;
	rateLimitTimeWindow?: number;
	rateLimitMax?: number;
	expiresAt?: string;
	metadata?: Record<string, unknown>;
}
