import type {
	FlagType,
	FlagWithScheduleForm,
	Variant,
} from "@databuddy/shared/flags";
import type { UseFormReturn } from "react-hook-form";

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
	rolloutBy?: string | null;
	rules?: UserRule[];
	targetGroups?: TargetGroup[] | string[];
	targetGroupIds?: string[];
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

export interface TargetGroup {
	id: string;
	name: string;
	description?: string | null;
	color: string;
	rules: UserRule[];
	memberCount?: number;
	websiteId: string;
	createdBy: string;
	createdAt: Date;
	updatedAt: Date;
}

export type FlagStatus = "active" | "inactive" | "archived";

export interface FlagSheetProps {
	isOpen: boolean;
	onCloseAction: () => void;
	websiteId: string;
	flag?: Flag | null;
	template?: FlagTemplate | null;
}

export interface VariantEditorProps {
	variants: Variant[];
	onChangeAction: (variants: Variant[]) => void;
}

export interface ScheduleManagerProps {
	form: UseFormReturn<FlagWithScheduleForm>;
	flagId?: string;
}

export interface DependencySelectorProps {
	value: string[];
	onChange: (dependencies: string[]) => void;
	availableFlags: Flag[];
	currentFlagKey?: string;
}

export interface UserRulesBuilderProps {
	rules: UserRule[];
	onChange: (rules: UserRule[]) => void;
}

export interface GroupsListProps {
	groups: TargetGroup[];
	isLoading: boolean;
	onCreateGroupAction: () => void;
	onEditGroupAction: (group: TargetGroup) => void;
	onDeleteGroup?: (groupId: string) => void;
}

export interface GroupSheetProps {
	isOpen: boolean;
	onCloseAction: () => void;
	websiteId: string;
	group?: TargetGroup | null;
}

export interface GroupSelectorProps {
	selectedGroups: string[];
	availableGroups: TargetGroup[];
	onChangeAction: (groupIds: string[]) => void;
}

export const GROUP_COLORS = [
	{ value: "#6366f1", label: "Indigo" },
	{ value: "#8b5cf6", label: "Violet" },
	{ value: "#ec4899", label: "Pink" },
	{ value: "#f43f5e", label: "Rose" },
	{ value: "#f97316", label: "Orange" },
	{ value: "#eab308", label: "Yellow" },
	{ value: "#22c55e", label: "Green" },
	{ value: "#14b8a6", label: "Teal" },
	{ value: "#06b6d4", label: "Cyan" },
	{ value: "#3b82f6", label: "Blue" },
] as const;

interface BaseFlagTemplate {
	id: string;
	name: string;
	description: string;
	category: string;
	icon: string;
	isBuiltIn: true;
	rules?: UserRule[];
}

type BooleanFlagTemplate = BaseFlagTemplate & {
	type: "boolean";
	defaultValue: boolean;
	rolloutPercentage?: number;
};

type RolloutFlagTemplate = BaseFlagTemplate & {
	type: "rollout";
	defaultValue: boolean;
	rolloutPercentage: number;
};

type MultivariantFlagTemplate = BaseFlagTemplate & {
	type: "multivariant";
	defaultValue: boolean;
	variants: Variant[];
};

export type FlagTemplate =
	| BooleanFlagTemplate
	| RolloutFlagTemplate
	| MultivariantFlagTemplate;

export interface TemplatesListProps {
	templates: FlagTemplate[];
	isLoading: boolean;
	onUseTemplateAction: (template: FlagTemplate) => void;
}
