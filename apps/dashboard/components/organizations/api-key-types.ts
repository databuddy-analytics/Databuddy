import type { API_SCOPES, ApiScope } from "@databuddy/api-keys/scopes";

export const SCOPE_OPTIONS: { value: ApiScope; label: string }[] = [
	{ value: "read:data", label: "Read data" },
	{ value: "track:events", label: "Event tracking" },
	{ value: "read:links", label: "Read links" },
	{ value: "write:links", label: "Write links" },
	{ value: "read:monitors", label: "Read monitors" },
	{ value: "write:monitors", label: "Write monitors" },
	{ value: "read:status_pages", label: "Read status pages" },
	{ value: "write:status_pages", label: "Write status pages" },
	{ value: "manage:websites", label: "Manage websites" },
	{ value: "manage:flags", label: "Manage flags" },
	{ value: "manage:config", label: "Manage config" },
] as const satisfies { value: (typeof API_SCOPES)[number]; label: string }[];

export const SCOPE_PRESETS: { label: string; scopes: readonly ApiScope[] }[] = [
	{ label: "Analytics", scopes: ["read:data"] },
	{ label: "Tracking", scopes: ["track:events"] },
	{ label: "Links", scopes: ["read:links", "write:links"] },
	{ label: "Monitors", scopes: ["read:monitors", "write:monitors"] },
	{
		label: "Status pages",
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
