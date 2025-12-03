"use client";

import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface EmptyStateProps {
	icon: Icon;
	title: string;
	description: string;
	features?: Array<{
		label: string;
	}>;
	action?: ReactNode;
	variant?: "default" | "success" | "warning" | "destructive";
}

export function EmptyState({
	icon: Icon,
	title,
	description,
	features,
	action,
	variant = "default",
}: EmptyStateProps) {
	const variantStyles = {
		default: "border-accent bg-accent/50 text-primary",
		success: "border-green-200 bg-green-100 text-green-600",
		warning: "border-orange-200 bg-orange-100 text-orange-600",
		destructive: "border-destructive/20 bg-destructive/10 text-destructive",
	};

	return (
		<div className="flex h-full flex-col items-center justify-center p-4 text-center sm:p-8">
			<div
				className={`mx-auto mb-6 w-fit rounded-2xl border p-6 sm:mb-8 sm:p-8 ${variantStyles[variant]}`}
			>
				<Icon
					className="h-12 w-12 text-accent-foreground sm:h-16 sm:w-16"
					size={48}
					weight="duotone"
				/>
			</div>
			<h3 className="mb-3 font-bold text-xl sm:mb-4 sm:text-2xl">{title}</h3>
			<p className="mb-6 max-w-md text-muted-foreground text-sm leading-relaxed sm:mb-8 sm:text-base">
				{description}
			</p>
			{features && (
				<div className="rounded-lg border border-dashed bg-muted/20 p-4 sm:p-6">
					<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs sm:flex-row sm:gap-3 sm:text-sm">
						{features.map((feature, index) => (
							<div className="flex items-center gap-2" key={index}>
								<div className="size-2 rounded-full bg-primary" />
								<span>{feature.label}</span>
							</div>
						))}
					</div>
				</div>
			)}
			{action && <div className="mt-4 sm:mt-6">{action}</div>}
		</div>
	);
}
