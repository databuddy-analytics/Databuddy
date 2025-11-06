"use client";

import { TargetIcon } from "@phosphor-icons/react";

interface FunnelStep {
	step_number: number;
	step_name: string;
	users: number;
	conversion_rate?: number;
	dropoff_rate?: number;
	avg_time_to_complete?: number;
	dropoffs?: number;
}

interface FunnelFlowProps {
	steps: FunnelStep[];
	totalUsers: number;
}

export function FunnelFlow({ steps, totalUsers }: FunnelFlowProps) {
	if (!steps.length) {
		return (
			<div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
				No funnel data available.
			</div>
		);
	}

	const maxUsers = Math.max(...steps.map((s) => s.users));
	const firstStep = steps.at(0);
	const lastStep = steps.at(-1);
	const overallConversion =
		totalUsers > 0 ? ((lastStep?.users || 0) / totalUsers) * 100 : 0;

	return (
		<div className="space-y-4">
			<div className="mb-2 flex items-center gap-2">
				<TargetIcon
					className="h-4 w-4 text-primary"
					size={16}
					weight="duotone"
				/>
				<h3 className="font-semibold text-base text-foreground">
					Funnel Steps
				</h3>
			</div>

			<div className="space-y-0">
				{steps.map((step, index) => {
					const prevStep = index > 0 ? steps[index - 1] : null;
					const droppedUsers = prevStep ? prevStep.users - step.users : 0;
					const relConversion =
						prevStep && prevStep.users > 0
							? (step.users / prevStep.users) * 100
							: 100;
					const absConversion =
						firstStep && firstStep.users > 0
							? (step.users / firstStep.users) * 100
							: 100;
					const barWidth = Math.max((step.users / maxUsers) * 100, 5);

					return (
						<div className="relative pb-6" key={step.step_number}>
							<div className="mb-2 flex items-center">
								<div className="mr-2 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
									{step.step_number}
								</div>
								<div className="truncate font-medium text-base text-foreground">
									{step.step_name}
								</div>
							</div>

							<div className="flex items-center pl-8">
								<div className="mr-4 min-w-[120px] flex-shrink-0">
									<span className="font-semibold text-foreground text-lg">
										{step.users.toLocaleString()}
									</span>
									<span className="ml-1 text-muted-foreground text-xs">
										users
									</span>
								</div>
								<div className="relative h-8 flex-grow overflow-hidden bg-muted">
									{index > 0 && prevStep && (
										<div
											className="absolute top-0 left-0 h-full"
											style={{
												width: `${relConversion}%`,
												backgroundImage:
													"repeating-linear-gradient(135deg, var(--color-success) 0 4px, transparent 4px 8px)",
												opacity: 0.18,
												pointerEvents: "none",
											}}
										/>
									)}
									<div
										className="absolute top-0 left-0 h-full bg-primary"
										style={{ width: `${barWidth}%` }}
									/>
									<div className="absolute top-1 right-3 z-20 flex flex-col items-end">
										<span className="font-semibold text-base text-foreground">
											{step.conversion_rate?.toFixed(1) ??
												absConversion.toFixed(1)}
											%
										</span>
									</div>
								</div>
							</div>

							{index !== 0 && droppedUsers > 0 && (
								<div className="mt-1 flex pl-8">
									<div className="mr-4 min-w-[140px]">
										<span className="font-medium text-destructive text-xs">
											-{droppedUsers.toLocaleString()} dropped
										</span>
									</div>
								</div>
							)}

							{index < steps.length - 1 && (
								<div className="-bottom-6 absolute top-6 left-[11px] flex flex-col items-center">
									<div className="h-full w-0.5 bg-muted" />
								</div>
							)}
						</div>
					);
				})}
			</div>

			<div className="mt-6 flex items-center justify-between rounded border bg-muted/30 p-4">
				<div>
					<div className="font-medium text-foreground">Overall Conversion</div>
					<div className="text-muted-foreground text-xs">
						{lastStep?.users?.toLocaleString() || 0} of{" "}
						{totalUsers.toLocaleString()} users completed the funnel
					</div>
				</div>
				<div className="font-bold text-2xl text-primary">
					{overallConversion.toFixed(1)}%
				</div>
			</div>
		</div>
	);
}
