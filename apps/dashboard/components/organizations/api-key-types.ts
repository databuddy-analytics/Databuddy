import type { API_SCOPES, ApiScope } from "@databuddy/api-keys/scopes";

export const SCOPE_OPTIONS: { value: ApiScope; label: string }[] = [
	{ value: "read:data", label: "Read Data" },
	{ value: "track:events", label: "Event Tracking" },
	{ value: "read:links", label: "Read Links" },
	{ value: "write:links", label: "Write Links" },
	{ value: "read:monitors", label: "Read Monitors" },
	{ value: "write:monitors", label: "Write Monitors" },
	{ value: "read:status_pages", label: "Read Status Pages" },
	{ value: "write:status_pages", label: "Write Status Pages" },
	{ value: "manage:websites", label: "Manage Websites" },
	{ value: "manage:flags", label: "Manage Flags" },
	{ value: "manage:config", label: "Manage Config" },
] as const satisfies { value: (typeof API_SCOPES)[number]; label: string }[];

export const SCOPE_PRESETS: { label: string; scopes: readonly ApiScope[] }[] = [
	{ label: "Analytics", scopes: ["read:data"] },
	{ label: "Tracking", scopes: ["track:events"] },
	{ label: "Links", scopes: ["read:links", "write:links"] },
	{ label: "Monitors", scopes: ["read:monitors", "write:monitors"] },
	{
		label: "Status Pages",
		scopes: ["read:status_pages", "write:status_pages"],
	},
	{
		label: "Config",
		scopes: ["manage:websites", "manage:flags", "manage:config"],
	},
] as const satisfies { label: string; scopes: readonly ApiScope[] }[];

export function formatMaskedApiKey({
	prefix,
	start,
}: Pick<ApiKeyListItem, "prefix" | "start">) {
	const cleanPrefix = prefix.endsWith("_") ? prefix.slice(0, -1) : prefix;
	const startIncludesPrefix =
		start === cleanPrefix || start.startsWith(`${cleanPrefix}_`);
	return `${startIncludesPrefix ? start : `${cleanPrefix}_${start}`}••••`;
}

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
	description?: string | null;
	enabled: boolean;
	expiresAt?: Date | string | null;
	id: string;
	lastUsedAt?: Date | string | null;
	metadata?: Record<string, unknown>;
	name: string;
	prefix: string;
	ratelimit?: {
		enabled: boolean;
		max: number | null;
		window: number | null;
	};
	resources?: Record<string, string[]>;
	revokedAt?: Date | null;
	scopes: ApiScope[];
	start: string;
	tags?: string[];
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
