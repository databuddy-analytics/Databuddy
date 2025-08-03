'use client';

import type { CheckProductPreview } from 'autumn-js';
import { useCustomer } from 'autumn-js/react';
import { ArrowRight, Loader2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from '@/components/ui/dialog';
import { getAttachContent } from '@/lib/autumn/attach-content';
import { cn } from '@/lib/utils';

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
	const { items, due_today } = preview;
	const { title, message } = getAttachContent(preview);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogContent
				className={cn('gap-0 overflow-hidden p-0 pt-4 text-foreground text-sm')}
			>
				<DialogTitle className={cn('mb-1 px-6 ')}>{title}</DialogTitle>
				<div className={cn('mt-1 mb-4 px-6 text-muted-foreground')}>
					{message}
				</div>
				{(items || optionsInput.length > 0) && (
					<div className="mb-6 px-6">
						{items?.map((item) => (
							<PriceItem key={item.description}>
								<span className="flex-1 truncate">{item.description}</span>
								<span>{item.price}</span>
							</PriceItem>
						))}

						{optionsInput?.map((option, index) => {
							return (
								<OptionsInput
									index={index}
									key={option.feature_name}
									option={option as FeatureOptionWithRequiredPrice}
									optionsInput={optionsInput}
									setOptionsInput={setOptionsInput}
								/>
							);
						})}
					</div>
				)}

				<DialogFooter className="flex flex-col justify-between gap-x-4 border-t bg-secondary py-2 pr-3 pl-6 shadow-inner sm:flex-row">
					{due_today && (
						<TotalPrice>
							<span>Due Today</span>
							<span>
								{new Intl.NumberFormat('en-US', {
									style: 'currency',
									currency: due_today.currency,
								}).format(getTotalPrice())}
							</span>
						</TotalPrice>
					)}
					<Button
						className="flex min-w-16 items-center gap-2"
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
						size="sm"
					>
						{loading ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<span className="flex gap-1 whitespace-nowrap">Confirm</span>
						)}
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
} & React.HTMLAttributes<HTMLDivElement>) => {
	return (
		<div
			className={cn(
				'flex flex-col justify-between gap-1 pb-4 sm:h-7 sm:flex-row sm:items-center sm:gap-2 sm:pb-0',
				className
			)}
			{...props}
		>
			{children}
		</div>
	);
};

interface FeatureOption {
	feature_id: string;
	feature_name: string;
	billing_units: number;
	price?: number;
	quantity?: number;
}

interface FeatureOptionWithRequiredPrice
	extends Omit<FeatureOption, 'price' | 'quantity'> {
	price: number;
	quantity: number;
}

export const OptionsInput = ({
	className,
	option,
	optionsInput,
	setOptionsInput,
	index,
}: {
	className?: string;
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
				value={quantity ? quantity / billing_units : ''}
			>
				<span className="">
					× ${price} per {billing_units === 1 ? ' ' : billing_units}{' '}
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
			className={cn(className, 'flex flex-row items-center gap-4')}
			{...props}
		>
			<div className="flex items-center gap-1">
				<Button
					className="h-6 w-6 pb-0.5"
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
					className="h-6 w-6 pb-0.5"
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

export const TotalPrice = ({ children }: { children: React.ReactNode }) => {
	return (
		<div className="flex w-full items-center justify-between font-semibold">
			{children}
		</div>
	);
};

export const PricingDialogButton = ({
	children,
	size,
	onClick,
	disabled,
	className,
}: {
	children: React.ReactNode;
	size?: 'sm' | 'lg' | 'default' | 'icon';
	onClick: () => void;
	disabled?: boolean;
	className?: string;
}) => {
	return (
		<Button
			className={cn(className, 'shadow-sm shadow-stone-400')}
			disabled={disabled}
			onClick={onClick}
			size={size}
		>
			{children}
			<ArrowRight className="!h-3" />
		</Button>
	);
};
