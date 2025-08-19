import { CheckIcon } from '@phosphor-icons/react/ssr';
import React from 'react';

import { cn } from '@/lib/utils';

interface StepsProps extends React.ComponentProps<'div'> {
	children: React.ReactNode;
}

function Steps({ className, children, ...props }: StepsProps) {
	const childrenArray = React.Children.toArray(children);

	return (
		<div className={cn('space-y-6', className)} {...props}>
			{childrenArray.map((child, index) => {
				if (React.isValidElement(child) && child.type === Step) {
					const stepProps = {
						...(child.props as StepProps),
						stepNumber: index + 1,
						total: childrenArray.length,
					} as StepProps;
					return React.cloneElement(child, stepProps);
				}
				return child;
			})}
		</div>
	);
}

interface StepProps extends React.ComponentProps<'div'> {
	title?: string;
	stepNumber?: number;
	total?: number;
}

function Step({
	className,
	title,
	stepNumber,
	total,
	children,
	...props
}: StepProps) {
	const isLast = stepNumber === total;

	return (
		<div className={cn('relative', !isLast && 'pb-6', className)} {...props}>
			{!isLast && (
				<div className="absolute top-8 left-6 h-full w-px bg-border" />
			)}

			<div className="flex items-start gap-4">
				<div className="flex size-12 shrink-0 items-center justify-center rounded border border-border bg-card/50 font-semibold text-foreground backdrop-blur-sm transition-all duration-300 hover:bg-card/70">
					{stepNumber}
				</div>

				<div className="min-w-0 flex-1 space-y-3">
					{title && (
						<h3 className="font-semibold text-foreground text-lg leading-6">
							{title}
						</h3>
					)}
					<div className="text-muted-foreground text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}

interface CompletedStepProps extends Omit<StepProps, 'stepNumber'> {
	stepNumber?: number;
}

function CompletedStep({
	className,
	title,
	stepNumber,
	total,
	children,
	...props
}: CompletedStepProps) {
	const isLast = stepNumber === total;

	return (
		<div
			className={cn('relative opacity-70', !isLast && 'pb-6', className)}
			{...props}
		>
			{!isLast && (
				<div className="absolute top-8 left-6 h-full w-px bg-border" />
			)}

			<div className="flex items-start gap-4">
				<div className="flex size-12 shrink-0 items-center justify-center rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:bg-card/70">
					<CheckIcon className="size-4 text-muted-foreground" />
				</div>

				<div className="min-w-0 flex-1 space-y-3">
					{title && (
						<h3 className="font-semibold text-foreground text-lg leading-6">
							{title}
						</h3>
					)}
					<div className="text-muted-foreground text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}

export { Steps, Step, CompletedStep };
