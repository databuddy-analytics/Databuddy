import { cloneElement, type ReactElement, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";

interface EmptyStateIconProps {
	"aria-hidden"?: boolean | "false" | "true";
	className?: string;
	size?: number | string;
}

export interface EmptyStateAction {
	label: string;
	onClick: () => void;
	size?: "sm" | "md" | "lg";
	tone?: "destructive";
	variant?: "primary" | "secondary" | "ghost";
}

export interface EmptyStateProps {
	action?: EmptyStateAction | ReactNode;
	className?: string;
	description?: ReactNode;
	icon?: ReactElement<EmptyStateIconProps>;
	isMainContent?: boolean;
	title: string;
	variant?: "default" | "minimal" | "error";
}

export function EmptyState({
	className,
	icon,
	title,
	description,
	action,
	variant = "minimal",
	isMainContent = false,
}: EmptyStateProps) {
	const renderIcon = () => {
		if (!icon || typeof icon !== "object" || !("type" in icon)) {
			return null;
		}

		const iconProps = icon.props || {};

		return (
			<div
				className={cn(
					"flex size-12 items-center justify-center rounded-lg bg-accent-foreground",
					variant === "error" && "bg-destructive/10"
				)}
			>
				{cloneElement(icon, {
					...iconProps,
					className: cn(
						"size-6 text-accent",
						variant === "error" && "text-destructive",
						iconProps.className
					),
					"aria-hidden": "true",
					size: 24,
				})}
			</div>
		);
	};

	const isActionObject = (
		a: EmptyStateAction | ReactNode
	): a is EmptyStateAction =>
		typeof a === "object" && a !== null && "label" in a && "onClick" in a;

	const Heading = isMainContent ? "h1" : "h2";

	return (
		<div
			className={cn(
				"flex flex-1 flex-col items-center justify-center gap-3 text-center",
				className
			)}
		>
			{renderIcon()}
			<div className="flex max-w-sm flex-col gap-1">
				<Heading className="mt-3 font-medium text-foreground text-lg">
					{title}
				</Heading>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>
			{action ? (
				<div className="pt-2">
					{isActionObject(action) ? (
						<Button
							onClick={action.onClick}
							size={action.size}
							tone={action.tone}
							variant={action.variant}
						>
							{action.label}
						</Button>
					) : (
						action
					)}
				</div>
			) : null}
		</div>
	);
}
