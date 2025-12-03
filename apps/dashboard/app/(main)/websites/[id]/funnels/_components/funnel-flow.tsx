"use client";

import { CaretDownIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { FunnelStepAnalytics } from "@/types/funnels";

interface FunnelFlowProps {
	steps: FunnelStepAnalytics[];
}

function formatTime(seconds: number): string {
	if (!seconds || seconds <= 0) return "—";
	if (seconds < 60) return `${Math.round(seconds)}s`;
	if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
	return `${Math.round(seconds / 3600)}h`;
}

const LINE_WIDTH = 1;
const LINE_GAP = 2;

interface LineProgressProps {
	percentage: number;
	isLast: boolean;
}

function LineProgress({ percentage, isLast }: LineProgressProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [lineCount, setLineCount] = useState(0);

	useLayoutEffect(() => {
		const updateLineCount = () => {
			if (!containerRef.current) return;
			const innerWidth = containerRef.current.clientWidth - 8; // account for px-1 padding
			const count = Math.floor(innerWidth / (LINE_WIDTH + LINE_GAP));
			setLineCount(count);
		};

		updateLineCount();
		window.addEventListener("resize", updateLineCount);
		return () => window.removeEventListener("resize", updateLineCount);
	}, []);

	const activeLines = Math.floor((percentage / 100) * lineCount);

	return (
		<div
			className="flex h-5 items-center gap-[2px] rounded bg-secondary px-1"
			ref={containerRef}
		>
			{Array.from({ length: lineCount }).map((_, index) => {
				const isActive = index < activeLines;
				return (
					<div
						className={cn(
							"h-3 w-px rounded-full transition-all duration-300",
							isActive
								? isLast
									? "scale-y-100 bg-success"
									: "scale-y-100 bg-chart-2"
								: "scale-y-[0.5] bg-border"
						)}
						key={index.toString()}
					/>
				);
			})}
		</div>
	);
}

export function FunnelFlow({ steps }: FunnelFlowProps) {
	if (!steps.length) {
		return (
			<div className="flex h-[120px] items-center justify-center rounded border border-border bg-card text-muted-foreground text-sm">
				No funnel steps configured
			</div>
		);
	}

	const firstStepUsers = steps.at(0)?.users || 1;
	const lastStep = steps.at(-1);

	return (
		<div className="rounded border border-border bg-card">
			{steps.map((step, index) => {
				const prevStep = index > 0 ? steps[index - 1] : null;
				const droppedUsers = prevStep ? prevStep.users - step.users : 0;
				const stepConversion =
					prevStep && prevStep.users > 0
						? (step.users / prevStep.users) * 100
						: 100;
				const totalConversion = (step.users / firstStepUsers) * 100;
				const isLast = index === steps.length - 1;
				const avgTime = step.avg_time_to_complete || 0;

				return (
					<div key={step.step_number}>
						{/* Drop-off connector */}
						{index !== 0 && (
							<div className="flex items-center justify-center gap-3 border-y bg-secondary/50 py-2">
								<div className="flex items-center gap-1.5 text-xs">
									<CaretDownIcon
										className="size-3 text-muted-foreground"
										weight="fill"
									/>
									<span className="text-muted-foreground">
										{droppedUsers.toLocaleString()} left
									</span>
									<span className="font-medium text-destructive">
										−{(100 - stepConversion).toFixed(0)}%
									</span>
								</div>
								{avgTime > 0 && (
									<span className="text-muted-foreground text-xs">
										· avg {formatTime(avgTime)}
									</span>
								)}
							</div>
						)}

						{/* Step card */}
						<div className="flex items-center gap-4 p-4">
							{/* Step number badge */}
							<div
								className={cn(
									"flex size-10 shrink-0 items-center justify-center rounded-full font-semibold text-sm",
									isLast
										? "bg-success/15 text-success"
										: "bg-secondary text-muted-foreground"
								)}
							>
								{isLast ? (
									<CheckCircleIcon className="size-5" weight="fill" />
								) : (
									step.step_number
								)}
							</div>

							{/* Step content */}
							<div className="min-w-0 flex-1">
								<div className="mb-2 flex items-baseline justify-between gap-2">
									<span className="truncate font-medium text-foreground">
										{step.step_name}
									</span>
									<span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
										{step.users.toLocaleString()} users
									</span>
								</div>

								{/* Line progress */}
								<LineProgress isLast={isLast} percentage={totalConversion} />
							</div>

							{/* Conversion percentage */}
							<div
								className={cn(
									"w-16 shrink-0 text-right font-bold text-lg tabular-nums",
									isLast ? "text-success" : "text-foreground"
								)}
							>
								{totalConversion.toFixed(0)}%
							</div>
						</div>
					</div>
				);
			})}

			{/* Summary footer */}
			{lastStep && steps.length > 1 && (
				<div className="flex items-center justify-between border-border border-t bg-secondary/50 px-4 py-3">
					<span className="text-muted-foreground text-sm">
						Overall conversion
					</span>
					<span className="font-bold text-success tabular-nums">
						{((lastStep.users / firstStepUsers) * 100).toFixed(1)}%
						<span className="ml-1.5 font-normal text-muted-foreground text-sm">
							({lastStep.users.toLocaleString()} of{" "}
							{firstStepUsers.toLocaleString()})
						</span>
					</span>
				</div>
			)}
		</div>
	);
}
