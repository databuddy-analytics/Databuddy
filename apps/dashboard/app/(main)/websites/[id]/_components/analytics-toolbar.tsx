"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AnalyticsDateControls } from "./analytics-date-controls";

interface AnalyticsToolbarProps {
	actions?: ReactNode;
	className?: string;
	isDisabled?: boolean;
}

export function AnalyticsToolbar({
	isDisabled = false,
	actions,
	className,
}: AnalyticsToolbarProps) {
	return (
		<div
			className={cn("flex shrink-0 items-center gap-2 border-b p-2", className)}
		>
			<AnalyticsDateControls isDisabled={isDisabled} />

			{actions && (
				<>
					<div className="flex-1" />
					<div className="flex items-center gap-1.5">{actions}</div>
				</>
			)}
		</div>
	);
}
