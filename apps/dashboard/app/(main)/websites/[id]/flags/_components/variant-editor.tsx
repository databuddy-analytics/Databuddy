"use client";

import type { Variant } from "@databuddy/shared/flags";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LineSlider } from "@/components/ui/line-slider";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { VariantEditorProps } from "./types";

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

		const newVariants = [...variants, newVariant];
		onChangeAction(newVariants);
	};

	const handleRemoveVariant = (index: number) => {
		const newVariants = variants.filter((_, i) => i !== index);
		onChangeAction(newVariants);
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

	const weightedVariants = variants.filter((v) => typeof v.weight === "number");
	const totalWeight = weightedVariants.reduce(
		(sum, v) => sum + (v.weight || 0),
		0
	);
	const isValidTotal =
		weightedVariants.length === 0 ? true : totalWeight === 100;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Label>Variants</Label>
				<div className="flex items-center gap-2">
					<label
						className="flex items-center gap-2 text-sm"
						htmlFor="use-weights-toggle"
					>
						<input
							checked={Boolean(
								variants.length > 0 && typeof variants[0]?.weight === "number"
							)}
							id="use-weights-toggle"
							onChange={(e) => {
								const useWeights = e.target.checked;
								const updatedVariants = variants.map((variant) => ({
									...variant,
									weight: useWeights
										? (variant.weight ?? 0)
										: (undefined as number | undefined),
								}));
								onChangeAction(updatedVariants);
							}}
							type="checkbox"
						/>
						<span className="text-xs">Use Weights</span>
					</label>
					<Select
						onValueChange={(v: "string" | "number" | "json") => {
							setDefaultValueType(v);

							const updatedVariants = variants.map((variant) => {
								let coercedValue: any = variant.value;
								switch (v) {
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
								return {
									...variant,
									type: v,
									value: coercedValue,
								};
							});
							onChangeAction(updatedVariants);
						}}
						value={defaultValueType}
					>
						<SelectTrigger className="h-8 w-[120px] text-xs">
							<SelectValue placeholder="Value Type" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="string">String</SelectItem>
							<SelectItem value="number">Number</SelectItem>
							<SelectItem value="json">JSON</SelectItem>
						</SelectContent>
					</Select>
					<Button
						className="h-8"
						onClick={handleAddVariant}
						size="sm"
						type="button"
						variant="outline"
					>
						<PlusIcon className="mr-2 size-3" />
						Add Variant
					</Button>
				</div>
			</div>

			<div className="space-y-3">
				{variants.map((variant, index) => (
					<div
						className="space-y-3 rounded-lg border bg-card p-3 shadow-sm"
						key={index}
					>
						<div className="flex items-start gap-3">
							<div className="grid flex-1 gap-3 sm:grid-cols-2">
								<div className="space-y-1">
									<Label className="text-muted-foreground text-xs">Key</Label>
									<Input
										className="h-8"
										onChange={(e) =>
											handleUpdateVariant(index, "key", e.target.value)
										}
										placeholder="e.g., control"
										value={variant.key}
									/>
								</div>
								<div className="space-y-1">
									<Label className="text-muted-foreground text-xs">Value</Label>
									<Input
										className="h-8"
										onChange={(e) =>
											handleUpdateVariant(index, "value", e.target.value)
										}
										placeholder="Value"
										value={
											typeof variant.value === "object"
												? JSON.stringify(variant.value)
												: variant.value
										}
									/>
								</div>
							</div>
							<Button
								aria-label="Remove variant"
								className="size-8 text-muted-foreground hover:text-destructive"
								disabled={variants.length <= 1}
								onClick={() => handleRemoveVariant(index)}
								size="icon"
								type="button"
								variant="ghost"
							>
								<TrashIcon className="size-4" />
							</Button>
						</div>

						{typeof variant.weight === "number" && (
							<div className="space-y-1">
								<Label className="text-xs">
									Traffic Weight: {variant.weight}%
								</Label>
								<LineSlider
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

			<div
				className={`flex items-center gap-2 text-sm ${
					totalWeight === 0
						? "text-blue-600"
						: isValidTotal
							? "text-green-600"
							: "text-amber-600"
				}`}
			>
				<div
					className={`size-2 rounded-full ${
						totalWeight === 0
							? "bg-blue-600"
							: isValidTotal
								? "bg-green-600"
								: "bg-amber-600"
					}`}
				/>
				{totalWeight === 0 ? (
					<>
						<span className="font-medium">Even Distribution</span>
						<span className="text-muted-foreground">
							(Each variant covers ~{Math.round(100 / variants.length)}% of
							traffic)
						</span>
					</>
				) : (
					<>
						Total Weight: {totalWeight}%{" "}
						{isValidTotal ? "(Valid)" : "(Must sum to 100%)"}
					</>
				)}
			</div>
		</div>
	);
}
