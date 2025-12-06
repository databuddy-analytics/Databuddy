"use client";

import { CircleNotchIcon } from "@phosphor-icons/react";
import type { CheckProductPreview } from "autumn-js";
import { useCustomer } from "autumn-js/react";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { getAttachContent } from "@/lib/autumn/attach-content";
import { cn } from "@/lib/utils";

export interface AttachDialogProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	preview: CheckProductPreview;
	onClick: (options?: any) => Promise<void>;
}

export default function AttachDialog(params?: AttachDialogProps) {
	const { attach } = useCustomer();
	const [loading, setLoading] = useState(false);
	const [optionsInput, setOptionsInput] = useState<FeatureOption[]>(
		params?.preview?.options || []
	);

	const getTotalPrice = () => {
		let sum = due_today?.price || 0;
		for (const option of optionsInput) {
			if (option.price && option.quantity) {
				sum += option.price * (option.quantity / option.billing_units);
			}
		}
		return sum;
	};

	useEffect(() => {
		setOptionsInput(params?.preview?.options || []);
	}, [params?.preview?.options]);

	if (!params?.preview) {
		return null;
	}

	const { open, setOpen, preview } = params;
	const { due_today } = preview;
	const { title, message } = getAttachContent(preview);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogContent className="w-[95vw] max-w-md sm:w-full">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{message}</DialogDescription>
				</DialogHeader>

				{/* Options Input (if any configurable options) */}
				{optionsInput.length > 0 && (
					<div className="space-y-2">
						{optionsInput.map((option, index) => (
							<OptionsInput
								index={index}
								key={option.feature_name}
								option={option as FeatureOptionWithRequiredPrice}
								optionsInput={optionsInput}
								setOptionsInput={setOptionsInput}
							/>
						))}
					</div>
				)}

				{/* Due Today */}
				{due_today && (
					<div className="flex items-center justify-between rounded border bg-accent/50 px-3 py-2">
						<span className="text-muted-foreground text-sm">Due today</span>
						<span className="font-semibold">
							{new Intl.NumberFormat("en-US", {
								style: "currency",
								currency: due_today.currency,
							}).format(getTotalPrice())}
						</span>
					</div>
				)}

				<DialogFooter>
					<Button
						className="w-full"
						disabled={loading}
						onClick={async () => {
							setLoading(true);
							await attach({
								productId: preview.product_id,
								options: optionsInput.map((option) => ({
									featureId: option.feature_id,
									quantity: option.quantity || 0,
								})),
							});
							setOpen(false);
							setLoading(false);
						}}
					>
						{loading && (
							<CircleNotchIcon className="mr-2 size-4 animate-spin" />
						)}
						Confirm Purchase
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export const PriceItem = ({
	children,
	className,
	...props
}: {
	children: React.ReactNode;
	className?: string;
} & React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col justify-between gap-1 pb-4 sm:h-7 sm:flex-row sm:items-center sm:gap-2 sm:pb-0",
			className
		)}
		{...props}
	>
		{children}
	</div>
);

interface FeatureOption {
	feature_id: string;
	feature_name: string;
	billing_units: number;
	price?: number;
	quantity?: number;
}

interface FeatureOptionWithRequiredPrice
	extends Omit<FeatureOption, "price" | "quantity"> {
	price: number;
	quantity: number;
}

export const OptionsInput = ({
	option,
	optionsInput,
	setOptionsInput,
	index,
}: {
	option: FeatureOptionWithRequiredPrice;
	optionsInput: FeatureOption[];
	setOptionsInput: (options: FeatureOption[]) => void;
	index: number;
} & React.HTMLAttributes<HTMLDivElement>) => {
	const { feature_name, billing_units, quantity, price } = option;
	return (
		<PriceItem key={feature_name}>
			<span>{feature_name}</span>
			<QuantityInput
				key={feature_name}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
					const newOptions = [...optionsInput];
					newOptions[index].quantity =
						Number.parseInt(e.target.value, 10) * billing_units;
					setOptionsInput(newOptions);
				}}
				value={quantity ? quantity / billing_units : ""}
			>
				<span className="">
					× ${price} per {billing_units === 1 ? " " : billing_units}{" "}
					{feature_name}
				</span>
			</QuantityInput>
		</PriceItem>
	);
};

export const QuantityInput = ({
	children,
	onChange,
	value,
	className,
	...props
}: {
	children: React.ReactNode;
	value: string | number;
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	className?: string;
} & React.HTMLAttributes<HTMLDivElement>) => {
	const currentValue = Number(value) || 0;

	const handleValueChange = (newValue: number) => {
		const syntheticEvent = {
			target: { value: String(newValue) },
		} as React.ChangeEvent<HTMLInputElement>;
		onChange(syntheticEvent);
	};

	return (
		<div
			className={cn(className, "flex flex-row items-center gap-4")}
			{...props}
		>
			<div className="flex items-center gap-1">
				<Button
					className="size-6 pb-0.5"
					disabled={currentValue <= 0}
					onClick={() =>
						currentValue > 0 && handleValueChange(currentValue - 1)
					}
					size="icon"
					variant="outline"
				>
					-
				</Button>
				<span className="w-8 text-center text-foreground">{currentValue}</span>
				<Button
					className="size-6 pb-0.5"
					onClick={() => handleValueChange(currentValue + 1)}
					size="icon"
					variant="outline"
				>
					+
				</Button>
			</div>
			{children}
		</div>
	);
};

export const TotalPrice = ({ children }: { children: React.ReactNode }) => (
	<div className="flex w-full items-center justify-between font-semibold">
		{children}
	</div>
);

export const PricingDialogButton = ({
	children,
	size,
	onClick,
	disabled,
	className,
}: {
	children: React.ReactNode;
	size?: "sm" | "lg" | "default" | "icon";
	onClick: () => void;
	disabled?: boolean;
	className?: string;
}) => (
	<Button
		className={cn(className)}
		disabled={disabled}
		onClick={onClick}
		size={size}
	>
		{children}
	</Button>
);
