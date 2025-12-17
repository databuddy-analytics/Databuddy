import { FlagType, Variant } from "@databuddy/shared/flags";

export interface Flag {
	id: string;
	key: string;
	name?: string | null;
	description?: string | null;
	type: FlagType;
	status: "active" | "inactive" | "archived";
	defaultValue?: boolean;
	payload?: unknown;
	rolloutPercentage?: number | null;
	rules?: UserRule[];
	variants?: Variant[];
	dependencies?: string[];
	environment?: string;
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
	type: "user_id" | "email" | "property";
	operator:
	| "equals"
	| "contains"
	| "starts_with"
	| "ends_with"
	| "in"
	| "not_in"
	| "exists"
	| "not_exists";
	field?: string;
	value?: string;
	values?: string[];
	enabled: boolean;
	batch: boolean;
	batchValues?: string[];
}
