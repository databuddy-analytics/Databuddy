import {
	CheckCircleIcon,
	InfoIcon,
	LightbulbIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@databuddy/ui/icons";
import { cn } from "@databuddy/ui";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import {
	docsIconWell,
	docsSurface,
	docsSurfaceBody,
} from "@/components/docs/docs-styles";

const calloutVariants = cva(`${docsSurface} flex gap-3 p-3.5`, {
	variants: {
		type: {
			info: "border-l-2 border-l-sidebar-primary/60",
			success: "border-l-2 border-l-emerald-500/70",
			warn: "border-l-2 border-l-amber-500/70",
			error: "border-destructive/30 border-l-2 border-l-destructive",
			tip: "border-l-2 border-l-brand-purple",
			note: "border-l-2 border-l-sidebar-border",
		},
	},
	defaultVariants: {
		type: "info",
	},
});

const iconShellVariants = cva(docsIconWell, {
	variants: {
		type: {
			info: "",
			success: "text-emerald-500",
			warn: "text-amber-500",
			error: "bg-destructive/10 text-destructive",
			tip: "text-brand-purple",
			note: "",
		},
	},
	defaultVariants: {
		type: "info",
	},
});

const titleVariants = cva("font-medium text-sidebar-foreground text-sm", {
	variants: {
		type: {
			info: "",
			success: "",
			warn: "",
			error: "text-destructive",
			tip: "",
			note: "",
		},
	},
	defaultVariants: {
		type: "info",
	},
});

const iconMap = {
	info: InfoIcon,
	success: CheckCircleIcon,
	warn: WarningCircleIcon,
	error: XCircleIcon,
	tip: LightbulbIcon,
	note: InfoIcon,
};

interface CalloutProps
	extends React.ComponentProps<"div">,
		VariantProps<typeof calloutVariants> {
	title?: string;
}

function Callout({
	className,
	type = "info",
	title,
	children,
	...props
}: CalloutProps) {
	const Icon = iconMap[type as keyof typeof iconMap] || iconMap.info;
	const hasTitle = !!title;

	return (
		<div
			className={cn(
				calloutVariants({ type }),
				hasTitle ? "items-start" : "items-center",
				className
			)}
			role={type === "error" || type === "warn" ? "alert" : "note"}
			{...props}
		>
			<div className={cn(iconShellVariants({ type }))}>
				<Icon className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				{title && <div className={cn(titleVariants({ type }))}>{title}</div>}
				<div
					className={cn(
						docsSurfaceBody,
						"[&_p:not(:first-child)]:mt-2 [&_p]:m-0",
						!hasTitle && "flex min-h-8 items-center"
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
}

export { Callout };
