"use client";

import type { Variant } from "@databuddy/shared/flags";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { VariantEditorProps } from "./types";
import { PlusIcon, TrashIcon } from "@databuddy/ui/icons";
import { Button, Field, Input } from "@databuddy/ui";
import { Checkbox, LineSlider, Select } from "@databuddy/ui/client";

export function VariantEditor({
	variants,
	onChangeAction,
}: VariantEditorProps) {
	const [defaultValueType, setDefaultValueType] = useState<
		"string" | "number" | "json"
	>("string");

	useEffect(() => {
		if (variants.length === 0) {
			onChangeAction([
				{
					key: "control",
					value: "control",
					weight: 50,
					description: "Control group",
					type: "string",
				},
				{
					key: "variant-a",
					value: "variant-a",
					weight: 50,
					description: "Variant A",
					type: "string",
				},
			]);
		}
	}, [variants.length, onChangeAction]);

	const handleAddVariant = () => {
		const newVariant: Variant = {
			key: `variant-${variants.length + 1}`,
			value: defaultValueType === "number" ? 0 : "",
			weight: undefined,
			description: "",
			type: defaultValueType,
		};
		onChangeAction([...variants, newVariant]);
	};

	const handleRemoveVariant = (index: number) => {
		onChangeAction(variants.filter((_, i) => i !== index));
	};

	const handleUpdateVariant = (
		index: number,
		field: keyof Variant,
		value: any
	) => {
		const newVariants = [...variants];

		if (field === "value") {
			const variantType = newVariants[index].type || "string";
			if (variantType === "number") {
				newVariants[index] = {
					...newVariants[index],
					[field]: Number(value) || 0,
				};
			} else if (variantType === "json") {
				try {
					const parsed = JSON.parse(value);
					newVariants[index] = { ...newVariants[index], [field]: parsed };
				} catch {
					newVariants[index] = { ...newVariants[index], [field]: value };
				}
			} else {
				newVariants[index] = { ...newVariants[index], [field]: value };
			}
		} else if (field === "type") {
			const newType = value as "string" | "number" | "json";
			let coercedValue: any = newVariants[index].value;
			switch (newType) {
				case "number":
					coercedValue = Number(coercedValue) || 0;
					break;
				case "json":
				case "string":
					coercedValue = "";
					break;
				default:
					coercedValue = "";
					break;
			}
			newVariants[index] = {
				...newVariants[index],
				type: newType,
				value: coercedValue,
			};
		} else {
			newVariants[index] = { ...newVariants[index], [field]: value };
		}

		onChangeAction(newVariants);
	};

	const useWeights =
		variants.length > 0 && typeof variants[0]?.weight === "number";
	const weightedVariants = variants.filter((v) => typeof v.weight === "number");
	const totalWeight = weightedVariants.reduce(
		(sum, v) => sum + (v.weight || 0),
		0
	);
	const isValidTotal =
		weightedVariants.length === 0 ? true : totalWeight === 100;

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<Field.Label>Variants</Field.Label>
				<div className="flex items-center gap-2">
					<Checkbox
						checked={useWeights}
						label="Weights"
						onCheckedChange={(checked) => {
							const updatedVariants = variants.map((variant) => ({
								...variant,
								weight: checked
									? (variant.weight ?? 0)
									: (undefined as number | undefined),
							}));
							onChangeAction(updatedVariants);
						}}
					/>
					<Select
						onValueChange={(v) => {
							const newType = String(v) as "string" | "number" | "json";
							setDefaultValueType(newType);
							const updatedVariants = variants.map((variant) => {
								let coercedValue: any = variant.value;
								switch (newType) {
									case "number":
										coercedValue = Number(coercedValue) || 0;
										break;
									case "json":
									case "string":
										coercedValue =
											typeof variant.value === "object"
												? JSON.stringify(variant.value)
												: String(variant.value || "");
										break;
									default:
										coercedValue = "";
										break;
								}
								return { ...variant, type: newType, value: coercedValue };
							});
							onChangeAction(updatedVariants);
						}}
						value={defaultValueType}
					>
						<Select.Trigger className="w-20" />
						<Select.Content>
							<Select.Item value="string">String</Select.Item>
							<Select.Item value="number">Number</Select.Item>
							<Select.Item value="json">JSON</Select.Item>
						</Select.Content>
					</Select>
				</div>
			</div>

			<div className="space-y-2">
				{variants.map((variant, index) => (
					<div
						className="space-y-2 rounded-lg border border-border/60 bg-card p-3"
						key={index}
					>
						<div className="flex items-start gap-2">
							<div className="grid flex-1 gap-2 sm:grid-cols-2">
								<Input
									onChange={(e) =>
										handleUpdateVariant(index, "key", e.target.value)
									}
									placeholder="e.g., control"
									value={variant.key}
								/>
								<Input
									onChange={(e) =>
										handleUpdateVariant(index, "value", e.target.value)
									}
									placeholder="Value"
									value={
										typeof variant.value === "object"
											? JSON.stringify(variant.value ?? "")
											: String(variant.value ?? "")
									}
								/>
							</div>
							<Button
								aria-label="Remove variant"
								className="text-muted-foreground hover:text-destructive"
								disabled={variants.length <= 1}
								onClick={() => handleRemoveVariant(index)}
								size="sm"
								type="button"
								variant="ghost"
							>
								<TrashIcon className="size-3.5" />
							</Button>
						</div>

						{typeof variant.weight === "number" && (
							<div className="space-y-1">
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground text-xs">Weight</span>
									<span className="font-mono text-foreground text-xs tabular-nums">
										{variant.weight}%
									</span>
								</div>
								<LineSlider
									aria-label={`Weight for ${variant.key}`}
									max={100}
									min={0}
									onValueChange={(val: number) =>
										handleUpdateVariant(index, "weight", val)
									}
									value={variant.weight}
								/>
							</div>
						)}
					</div>
				))}
			</div>

			<div className="flex items-center justify-between">
				<div
					className={cn(
						"flex items-center gap-1.5 text-xs",
						totalWeight === 0
							? "text-muted-foreground"
							: isValidTotal
								? "text-success"
								: "text-warning"
					)}
				>
					<div
						className={cn(
							"size-1.5 rounded-full",
							totalWeight === 0
								? "bg-muted-foreground"
								: isValidTotal
									? "bg-success"
									: "bg-warning"
						)}
					/>
					{totalWeight === 0 ? (
						<span>
							Even split (~{Math.round(100 / Math.max(variants.length, 1))}%
							each)
						</span>
					) : (
						<span>
							{totalWeight}% {isValidTotal ? "total" : "— must add up to 100%"}
						</span>
					)}
				</div>
				<Button
					onClick={handleAddVariant}
					size="sm"
					type="button"
					variant="ghost"
				>
					<PlusIcon className="size-3.5" />
					Add
				</Button>
			</div>
		</div>
	);
}
