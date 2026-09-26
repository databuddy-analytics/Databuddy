"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
	MonitorDetail,
	MonitorDetailLoading,
} from "@/app/(main)/monitors/_components/monitor-detail";
import { TopBar } from "@/components/layout/top-bar";
import { MonitorSheet } from "@/components/monitors/monitor-sheet";
import { orpc } from "@/lib/orpc";
import { HeartbeatIcon } from "@databuddy/ui/icons";
import { EmptyState } from "@databuddy/ui";

export default function PulsePage() {
	const { id: websiteId } = useParams<{ id: string }>();
	const [isSheetOpen, setIsSheetOpen] = useState(false);

	const scheduleQuery = useQuery({
		...orpc.uptime.getScheduleByWebsiteId.queryOptions({
			input: { websiteId },
		}),
		enabled: !!websiteId,
	});

	if (scheduleQuery.data) {
		return (
			<MonitorDetail
				initialSchedule={scheduleQuery.data}
				scheduleId={scheduleQuery.data.id}
				title="Uptime"
			/>
		);
	}

	let content: React.ReactNode;
	if (scheduleQuery.isPending) {
		content = <MonitorDetailLoading />;
	} else if (scheduleQuery.isError) {
		content = (
			<EmptyState
				action={{ label: "Retry", onClick: () => scheduleQuery.refetch() }}
				description="Something went wrong while loading this website's monitor."
				icon={<HeartbeatIcon />}
				title="Failed to load monitor"
				variant="error"
			/>
		);
	} else {
		content = (
			<EmptyState
				action={{
					label: "Create a monitor",
					onClick: () => setIsSheetOpen(true),
				}}
				className="h-full py-0"
				description="Track availability, then link an alert to get notified when the site goes down."
				icon={<HeartbeatIcon />}
				title="No monitor yet"
				variant="minimal"
			/>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Uptime</h1>
			</TopBar.Title>
			{scheduleQuery.isPending ? (
				content
			) : (
				<div className="flex flex-1 items-center justify-center p-4">
					{content}
				</div>
			)}
			<MonitorSheet
				onCloseAction={setIsSheetOpen}
				open={isSheetOpen}
				websiteId={websiteId}
			/>
		</div>
	);
}
