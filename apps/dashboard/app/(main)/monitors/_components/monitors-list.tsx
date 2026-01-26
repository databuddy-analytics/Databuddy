"use client";

import { HeartbeatIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/empty-state";
import { MonitorRow } from "@/components/monitors/monitor-row";

export interface Monitor {
	id: string;
	websiteId: string | null;
	url: string | null;
	name: string | null;
	granularity: string;
	cron: string;
	isPaused: boolean;
	createdAt: Date | string;
	updatedAt: Date | string;
	website: {
		id: string;
		name: string | null;
		domain: string;
	} | null;
	jsonParsingConfig?: {
		enabled: boolean;
		mode: "auto" | "manual";
		fields?: string[];
	} | null;
}

interface MonitorsListProps {
	monitors: Monitor[];
	isLoading: boolean;
	onCreateMonitorAction: () => void;
	onEditMonitorAction: (monitor: Monitor) => void;
	onDeleteMonitorAction: () => void;
	onRefetchAction: () => void;
}

export function MonitorsList({
	monitors,
	isLoading,
	onCreateMonitorAction,
	onEditMonitorAction,
	onDeleteMonitorAction,
	onRefetchAction,
}: MonitorsListProps) {
	if (isLoading) {
		return null;
	}

	if (monitors.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center py-16">
				<EmptyState
					action={{
						label: "Create Your First Monitor",
						onClick: onCreateMonitorAction,
					}}
					description="Create your first uptime monitor to start tracking availability and receive alerts when services go down."
					icon={<HeartbeatIcon weight="duotone" />}
					title="No monitors yet"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<div>
			{monitors.map((monitor) => (
				<MonitorRow
					key={monitor.id}
					onDeleteAction={onDeleteMonitorAction}
					onEditAction={() => onEditMonitorAction(monitor)}
					onRefetchAction={onRefetchAction}
					schedule={monitor}
				/>
			))}
		</div>
	);
}
