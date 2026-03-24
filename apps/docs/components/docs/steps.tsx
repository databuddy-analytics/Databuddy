import { CheckIcon } from "@phosphor-icons/react/ssr";
import React from "react";
import { cn } from "@/lib/utils";

interface StepsProps extends React.ComponentProps<"div"> {
	children: React.ReactNode;
}

function Steps({ className, children, ...props }: StepsProps) {
	const childrenArray = React.Children.toArray(children);

	return (
		<div className={cn("my-4 space-y-0", className)} {...props}>
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

interface StepProps extends React.ComponentProps<"div"> {
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
		<div
			className={cn(
				"relative border-border border-l-2 py-4 pl-8",
				isLast && "border-l-transparent",
				className
			)}
			{...props}
		>
			<div className="absolute top-4 left-[-13px] flex size-6 items-center justify-center border border-border bg-muted font-mono text-foreground text-xs dark:bg-[#101010]">
				{stepNumber}
			</div>

			<div className="min-w-0">
				{title && (
					<h3 className="mb-1 font-semibold text-foreground text-sm">
						{title}
					</h3>
				)}
				<div className="text-muted-foreground text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
					{children}
				</div>
			</div>
		</div>
	);
}

interface CompletedStepProps extends Omit<StepProps, "stepNumber"> {
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
			className={cn(
				"relative border-border border-l-2 py-4 pl-8 opacity-60",
				isLast && "border-l-transparent",
				className
			)}
			{...props}
		>
			<div className="absolute top-4 left-[-13px] flex size-6 items-center justify-center border border-border bg-muted dark:bg-[#101010]">
				<CheckIcon className="size-3 text-muted-foreground" />
			</div>

			<div className="min-w-0">
				{title && (
					<h3 className="mb-1 font-semibold text-foreground text-sm">
						{title}
					</h3>
				)}
				<div className="text-muted-foreground text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
					{children}
				</div>
			</div>
		</div>
	);
}

export { CompletedStep, Step, Steps };
