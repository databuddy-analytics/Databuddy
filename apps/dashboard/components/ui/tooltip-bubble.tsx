import type React from "react";
import { cn } from "@/lib/utils";

interface TooltipBubbleProps {
	children: React.ReactNode;
	className?: string;
}

export const TooltipBubble: React.FC<TooltipBubbleProps> = ({
	children,
	className,
}) => {
	return (
		<div
			className={cn(
				"min-w-[150px] rounded-lg border border-border/20 bg-background/80 p-2 shadow-xl backdrop-blur-lg transition-all duration-100",
				className
			)}
		>
			{children}
		</div>
	);
};
