import type { API_SCOPES, ApiScope } from "@databuddy/api-keys/scopes";

export const SCOPE_OPTIONS: { value: ApiScope; label: string }[] = [
	{ value: "read:data", label: "Read Data" },
	{ value: "track:events", label: "Event Tracking" },
	{ value: "track:llm", label: "LLM Tracking" },
	{ value: "read:links", label: "Read Links" },
	{ value: "write:links", label: "Write Links" },
	{ value: "manage:websites", label: "Manage Websites" },
	{ value: "manage:flags", label: "Manage Flags" },
	{ value: "manage:config", label: "Manage Config" },
] as const satisfies { value: (typeof API_SCOPES)[number]; label: string }[];

export type ApiResourceType =
	| "global"
	| "website"
	| "ab_experiment"
	| "feature_flag"
	| "analytics_data"
	| "error_data"
	| "web_vitals"
	| "custom_events"
	| "export_data";

export interface ApiKeyAccessEntry {
	resourceId?: string | null;
	resourceType: ApiResourceType;
	scopes: ApiScope[];
}

export interface ApiKeyListItem {
	createdAt: Date;
	enabled: boolean;
	expiresAt?: string | null;
	id: string;
	metadata?: Record<string, unknown>;
	name: string;
	prefix: string;
	rateLimitEnabled?: boolean;
	rateLimitMax?: number | null;
	rateLimitTimeWindow?: number | null;
	revokedAt?: Date | null;
	scopes: ApiScope[];
	start: string;
	type: "user" | "sdk" | "automation";
	updatedAt: Date;
}

export interface ApiKeyDetail extends ApiKeyListItem {
	access: Array<{ id: string } & ApiKeyAccessEntry>;
}

export interface CreateApiKeyInput {
	access?: ApiKeyAccessEntry[];
	expiresAt?: string;
	globalScopes?: ApiScope[];
	metadata?: Record<string, unknown>;
	name: string;
	organizationId: string;
	rateLimitEnabled?: boolean;
	rateLimitMax?: number;
	rateLimitTimeWindow?: number;
	type?: "user" | "sdk" | "automation";
}
