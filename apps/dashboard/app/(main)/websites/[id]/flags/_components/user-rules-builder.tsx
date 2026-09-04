"use client";

import { z } from "zod/mini";
import type { UserRule, UserRulesBuilderProps } from "./types";
import {
	EnvelopeIcon,
	PlusIcon,
	TrashIcon,
	UserIcon,
	WrenchIcon,
} from "@databuddy/ui/icons";
import { Button, Input } from "@databuddy/ui";
import { Select, Switch, TagsInput } from "@databuddy/ui/client";

const TARGET_TYPES = [
	{ value: "user_id", label: "User ID", icon: UserIcon },
	{ value: "email", label: "Email", icon: EnvelopeIcon },
	{ value: "property", label: "Property", icon: WrenchIcon },
] as const;

const CONDITIONS = [
	{ value: "equals", label: "is", needsValue: true },
	{ value: "contains", label: "contains", needsValue: true },
	{ value: "starts_with", label: "starts with", needsValue: true },
	{ value: "ends_with", label: "ends with", needsValue: true },
	{ value: "in", label: "is one of", needsValue: true },
	{ value: "not_in", label: "is not one of", needsValue: true },
	{ value: "exists", label: "exists", needsValue: false },
	{ value: "not_exists", label: "doesn't exist", needsValue: false },
] as const;

function getConditionsForType(type: UserRule["type"]) {
	return type === "property"
		? CONDITIONS
		: CONDITIONS.filter(
				(c) => c.value !== "exists" && c.value !== "not_exists"
			);
}

function getCurrentValues(rule: UserRule): string[] {
	if (rule.values?.length) {
		return rule.values;
	}
	if (rule.batchValues?.length) {
		return rule.batchValues;
	}
	if (rule.value) {
		return [rule.value];
	}
	return [];
}

function RuleRow({
	rule,
	onUpdate,
	onRemove,
}: {
	onRemove: () => void;
	onUpdate: (updates: Partial<UserRule>) => void;
	rule: UserRule;
}) {
	const conditions = getConditionsForType(rule.type);
	const needsValue =
		CONDITIONS.find((c) => c.value === rule.operator)?.needsValue ?? true;
	const currentValues = getCurrentValues(rule);

	const handleTypeChange = (newType: UserRule["type"]) => {
		const needsReset =
			newType !== "property" &&
			(rule.operator === "exists" || rule.operator === "not_exists");

		onUpdate({
			type: newType,
			...(needsReset && { operator: "equals" }),
		});
	};

	const getPlaceholder = () => {
		if (rule.type === "email") {
			if (rule.operator === "ends_with") {
				return "e.g. @company.com";
			}
			if (rule.operator === "starts_with") {
				return "e.g. admin@";
			}
			if (rule.operator === "contains") {
				return "e.g. company";
			}
			return "Enter emails…";
		}
		if (rule.type === "user_id") {
			return "Enter user IDs…";
		}
		return "Enter values…";
	};

	const validateEmail = (value: string) => {
		const exactMatchOperators = ["equals", "in", "not_in"];
		if (exactMatchOperators.includes(rule.operator)) {
			const result = z.email().safeParse(value);
			return result.success
				? { success: true }
				: { success: false, error: "Please enter a valid email address" };
		}
		if (!value.trim()) {
			return { success: false, error: "Value cannot be empty" };
		}
		return { success: true };
	};

	const TypeIcon =
		TARGET_TYPES.find((t) => t.value === rule.type)?.icon ?? UserIcon;

	return (
		<div className="space-y-2 rounded-md border border-border/60 p-3">
			<div className="flex items-center gap-2">
				<Select
					onValueChange={(v) => handleTypeChange(v as UserRule["type"])}
					value={rule.type}
				>
					<Select.Trigger className="w-auto gap-1.5">
						<TypeIcon className="size-3.5" />
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						{TARGET_TYPES.map((t) => (
							<Select.Item key={t.value} value={t.value}>
								{t.label}
							</Select.Item>
						))}
					</Select.Content>
				</Select>

				{rule.type === "property" && (
					<Input
						className="w-28"
						onChange={(e) => onUpdate({ field: e.target.value })}
						placeholder="field…"
						value={rule.field || ""}
					/>
				)}

				<Select
					onValueChange={(v) =>
						onUpdate({
							operator: v as UserRule["operator"],
							batchValues: currentValues,
							batch: true,
						})
					}
					value={rule.operator}
				>
					<Select.Trigger className="w-auto">
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						{conditions.map((c) => (
							<Select.Item key={c.value} value={c.value}>
								{c.label}
							</Select.Item>
						))}
					</Select.Content>
				</Select>

				<div className="flex-1" />

				<Switch
					checked={rule.enabled}
					onCheckedChange={(checked) => onUpdate({ enabled: !!checked })}
				/>

				<button
					className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
					onClick={onRemove}
					type="button"
				>
					<TrashIcon className="size-3.5" />
				</button>
			</div>

			{needsValue && (
				<TagsInput
					onChange={(values) => onUpdate({ batchValues: values, batch: true })}
					placeholder={getPlaceholder()}
					validate={rule.type === "email" ? validateEmail : undefined}
					values={currentValues}
				/>
			)}
		</div>
	);
}

export function UserRulesBuilder({ rules, onChange }: UserRulesBuilderProps) {
	const addRule = () => {
		onChange([
			...rules,
			{
				type: "user_id",
				operator: "equals",
				values: [],
				batchValues: [],
				enabled: true,
				batch: true,
			},
		]);
	};

	const updateRule = (index: number, updates: Partial<UserRule>) => {
		const newRules = [...rules];
		const syncedUpdates = { ...updates };
		if (syncedUpdates.values !== undefined) {
			syncedUpdates.batchValues = syncedUpdates.values;
		}
		newRules[index] = { ...newRules[index], ...syncedUpdates, batch: true };
		onChange(newRules);
	};

	const removeRule = (index: number) => {
		onChange(rules.filter((_, i) => i !== index));
	};

	if (rules.length === 0) {
		return (
			<div className="rounded-lg border border-dashed bg-accent/50 p-4 text-center">
				<UserIcon className="mx-auto mb-2 size-6 text-muted-foreground" />
				<p className="mb-3 text-balance text-muted-foreground text-xs">
					Match users by ID, email, or property
				</p>
				<Button onClick={addRule} size="sm" type="button" variant="secondary">
					<PlusIcon className="size-3.5" />
					Add Rule
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{rules.map((rule, index) => (
				<RuleRow
					key={index}
					onRemove={() => removeRule(index)}
					onUpdate={(updates) => updateRule(index, updates)}
					rule={rule}
				/>
			))}

			<Button
				className="w-full text-muted-foreground"
				onClick={addRule}
				size="sm"
				type="button"
				variant="secondary"
			>
				<PlusIcon className="size-3.5" />
				Add Rule
			</Button>
		</div>
	);
}
