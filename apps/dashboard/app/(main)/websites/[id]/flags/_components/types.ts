export interface Flag {
	id: string;
	key: string;
	name?: string | null;
	description?: string | null;
	type: 'boolean' | 'rollout';
	status: 'active' | 'inactive' | 'archived';
	defaultValue?: boolean;
	payload?: unknown;
	rolloutPercentage?: number | null;
	rules?: UserRule[];
	persistAcrossAuth?: boolean;
	websiteId?: string | null;
	organizationId?: string | null;
	userId?: string | null;
	createdBy: string;
	createdAt: Date;
	updatedAt: Date;
	deletedAt?: Date | null;
}

export interface UserRule {
	type: 'user_id' | 'email' | 'property';
	operator:
		| 'equals'
		| 'contains'
		| 'starts_with'
		| 'ends_with'
		| 'in'
		| 'not_in'
		| 'exists'
		| 'not_exists';
	field?: string;
	value?: string;
	values?: string[];
	enabled: boolean;
	batch: boolean;
	batchValues?: string[];
}
