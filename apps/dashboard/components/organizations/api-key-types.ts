export type ApiScope =
	| 'read:data'
	| 'write:data'
	| 'read:experiments'
	| 'track:events'
	| 'admin:apikeys';

export type ApiResourceType =
	| 'global'
	| 'website'
	| 'ab_experiment'
	| 'feature_flag';

export interface ApiKeyAccessEntry {
	resourceType: ApiResourceType;
	resourceId?: string | null;
	scopes: ApiScope[];
}

export interface ApiKeyListItem {
	id: string;
	name: string;
	prefix: string;
	start: string;
	type: 'user' | 'sdk' | 'automation';
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
}

export interface ApiKeyDetail extends ApiKeyListItem {
	access: Array<{ id: string } & ApiKeyAccessEntry>;
}

export interface CreateApiKeyInput {
	name: string;
	organizationId?: string;
	type?: 'user' | 'sdk' | 'automation';
	globalScopes?: ApiScope[];
	access?: ApiKeyAccessEntry[];
	rateLimitEnabled?: boolean;
	rateLimitTimeWindow?: number;
	rateLimitMax?: number;
	expiresAt?: string;
	metadata?: Record<string, unknown>;
}
