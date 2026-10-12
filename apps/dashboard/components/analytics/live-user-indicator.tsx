"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useRealTimeStats } from "./use-realtime-stats";

interface LiveUserIndicatorProps {
	websiteId: string;
}

export function LiveUserIndicator({ websiteId }: LiveUserIndicatorProps) {
	const { activeUsers: count } = useRealTimeStats(websiteId);
	const prevCountRef = useRef(count);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);
	const [change, setChange] = useState<"up" | "down" | null>(null);

	useEffect(() => {
		const prevCount = prevCountRef.current;

		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		if (count > prevCount) {
			setChange("up");
			timeoutRef.current = setTimeout(() => setChange(null), 1000);
		} else if (count < prevCount) {
			setChange("down");
			timeoutRef.current = setTimeout(() => setChange(null), 1000);
		}

		prevCountRef.current = count;

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [count]);

	return (
		<div className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-sidebar-accent/55 px-2.5 text-[12px]">
			<span className="relative flex size-1.5">
				<span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
				<span className="relative inline-flex size-1.5 rounded-full bg-success" />
			</span>
			<span
				className={cn(
					"font-medium tabular-nums",
					change === "up" && "text-success",
					change === "down" && "text-destructive",
					!change && "text-foreground"
				)}
			>
				{count}
			</span>
			<span className="text-muted-foreground">live</span>
		</div>
	);
}
