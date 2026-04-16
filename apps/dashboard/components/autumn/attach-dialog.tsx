"use client";

import { CircleNotchIcon } from "@phosphor-icons/react";
import type { PreviewAttachResponse } from "autumn-js";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface AttachDialogProps {
	onConfirm: () => Promise<void>;
	open: boolean;
	planId: string;
	preview: PreviewAttachResponse;
	setOpen: (open: boolean) => void;
}

export default function AttachDialog({
	open,
	setOpen,
	preview,
	onConfirm,
}: AttachDialogProps) {
	const [loading, setLoading] = useState(false);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogContent className="w-[95vw] max-w-md sm:w-full">
				<DialogHeader>
					<DialogTitle>Confirm Subscription</DialogTitle>
					<DialogDescription>
						By clicking confirm, your payment method will be charged.
					</DialogDescription>
				</DialogHeader>

				{preview.total > 0 && (
					<div className="flex items-center justify-between rounded border bg-accent/50 px-3 py-2">
						<span className="text-muted-foreground text-sm">Due today</span>
						<span className="font-semibold">
							{new Intl.NumberFormat("en-US", {
								style: "currency",
								currency: preview.currency,
							}).format(preview.total)}
						</span>
					</div>
				)}

				<DialogFooter>
					<Button
						className="w-full"
						disabled={loading}
						onClick={async () => {
							setLoading(true);
							try {
								await onConfirm();
								setOpen(false);
							} finally {
								setLoading(false);
							}
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
