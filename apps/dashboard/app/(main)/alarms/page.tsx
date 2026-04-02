"use client";

import { BellIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlarmsList } from "@/components/alarms/alarms-list";
import { CreateAlarmDialog } from "@/components/alarms/create-alarm-dialog";

export interface Alarm {
	id: string;
	organizationId: string;
	websiteId: string | null;
	name: string;
	description: string | null;
	enabled: boolean;
	triggerType: string;
	triggerConditions: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

async function fetchAlarms(): Promise<Alarm[]> {
	const res = await fetch("/v1/alarms");
	if (!res.ok) throw new Error("Failed to fetch alarms");
	const json = await res.json();
	return json.data ?? [];
}

export default function AlarmsPage() {
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const queryClient = useQueryClient();

	const { data: alarms = [], isLoading } = useQuery({
		queryKey: ["alarms"],
		queryFn: fetchAlarms,
	});

	return (
		<div className="flex flex-col gap-6 p-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<BellIcon size={24} />
					<h1 className="text-2xl font-semibold">Alarms</h1>
				</div>
				<Button onClick={() => setIsCreateOpen(true)}>
					<PlusIcon size={16} />
					New Alarm
				</Button>
			</div>

			<AlarmsList
				alarms={alarms}
				isLoading={isLoading}
			/>

			<CreateAlarmDialog
				open={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				onSuccess={() => {
					queryClient.invalidateQueries({ queryKey: ["alarms"] });
					setIsCreateOpen(false);
				}}
			/>
		</div>
	);
}
