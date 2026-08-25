import { cn } from "@databuddy/ui";
import React from "react";

interface StepsProps extends React.ComponentProps<"div"> {
	children: React.ReactNode;
}

function Steps({ className, children, ...props }: StepsProps) {
	const childrenArray = React.Children.toArray(children);

	return (
		<div className={cn("not-prose my-4 space-y-0", className)} {...props}>
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
	stepNumber?: number;
	title?: string;
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
				"relative border-border/60 border-l py-4 pl-8",
				isLast && "border-l-transparent",
				className
			)}
			{...props}
		>
			<div className="absolute top-4 left-[-13px] flex size-6 items-center justify-center rounded-md border border-border/60 bg-card font-mono text-foreground text-xs">
				{stepNumber}
			</div>

			<div className="min-w-0">
				{title && (
					<h3 className="mb-1 font-medium text-foreground text-sm">{title}</h3>
				)}
				<div className="text-muted-foreground text-sm leading-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
					{children}
				</div>
			</div>
		</div>
	);
}

export { Step, Steps };
