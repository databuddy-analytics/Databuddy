import type {
	FlagType,
	FlagWithScheduleForm,
	Variant,
} from "@databuddy/shared/flags";
import type { UseFormReturn } from "react-hook-form";

export interface Flag {
	createdAt: Date;
	createdBy: string;
	defaultValue?: boolean;
	deletedAt?: Date | null;
	dependencies?: string[];
	description?: string | null;
	environment?: string;
	id: string;
	key: string;
	name?: string | null;
	organizationId?: string | null;
	payload?: unknown;
	persistAcrossAuth?: boolean;
	rolloutBy?: string | null;
	rolloutPercentage?: number | null;
	rules?: UserRule[];
	status: "active" | "inactive" | "archived";
	targetGroupIds?: string[];
	targetGroups?: TargetGroup[] | string[];
	type: FlagType;
	updatedAt: Date;
	userId?: string | null;
	variants?: Variant[];
	websiteId?: string | null;
}

export interface UserRule {
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

export interface TargetGroup {
	color: string;
	createdAt: Date;
	createdBy: string;
	description?: string | null;
	id: string;
	memberCount?: number;
	name: string;
	rules: UserRule[];
	updatedAt: Date;
	websiteId: string;
}

export type FlagStatus = "active" | "inactive" | "archived";

export interface FlagSheetProps {
	flag?: Flag | null;
	isOpen: boolean;
	onCloseAction: () => void;
	template?: FlagTemplate | null;
	websiteId: string;
}

export interface VariantEditorProps {
	onChangeAction: (variants: Variant[]) => void;
	variants: Variant[];
}

export interface ScheduleManagerProps {
	flagId?: string;
	form: UseFormReturn<FlagWithScheduleForm>;
}

export interface DependencySelectorProps {
	availableFlags: Flag[];
	currentFlagKey?: string;
	onChange: (dependencies: string[]) => void;
	value: string[];
}

export interface UserRulesBuilderProps {
	onChange: (rules: UserRule[]) => void;
	rules: UserRule[];
}

export interface GroupsListProps {
	groups: TargetGroup[];
	isLoading: boolean;
	onCreateGroupAction: () => void;
	onDeleteGroup?: (groupId: string) => void;
	onEditGroupAction: (group: TargetGroup) => void;
}

export interface GroupSheetProps {
	group?: TargetGroup | null;
	isOpen: boolean;
	onCloseAction: () => void;
	websiteId: string;
}

export interface GroupSelectorProps {
	availableGroups: TargetGroup[];
	onChangeAction: (groupIds: string[]) => void;
	selectedGroups: string[];
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
	category: string;
	description: string;
	icon: string;
	id: string;
	isBuiltIn: true;
	name: string;
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
	isLoading: boolean;
	onUseTemplateAction: (template: FlagTemplate) => void;
	templates: FlagTemplate[];
}
