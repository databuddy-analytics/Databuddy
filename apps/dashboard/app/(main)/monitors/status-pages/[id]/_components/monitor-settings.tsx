"use client";

import { HeartbeatIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { orpc } from "@/lib/orpc";
import { AddMonitorSheet } from "./add-monitor-sheet";
import { AddSectionSheet } from "./add-section-sheet";

interface MonitorEntry {
	id: string;
	statusPageId: string;
	sectionId: string | null;
	scheduleId: string;
	displayName: string | null;
	sortOrder: number;
	showLink: boolean;
	showLatency: boolean;
	showUptimePct: boolean;
	showStatus: boolean;
	showLastChecked: boolean;
	schedule: {
		id: string;
		url: string;
		name: string | null;
		website?: { id: string; name: string | null; domain: string } | null;
	} | null;
}

interface Section {
	id: string;
	statusPageId: string;
	name: string;
	description: string | null;
	sortOrder: number;
	isCollapsed: boolean;
}

type ToggleField = "showStatus" | "showLink" | "showLatency" | "showUptimePct" | "showLastChecked";

const TOGGLES: { key: ToggleField; label: string }[] = [
	{ key: "showStatus", label: "Status" },
	{ key: "showLink", label: "URL" },
	{ key: "showLatency", label: "Latency" },
	{ key: "showUptimePct", label: "Uptime %" },
	{ key: "showLastChecked", label: "Last Checked" },
];

export function MonitorSettings({
	page,
	invalidateAction,
}: {
	page: { id: string; sections: Section[]; monitors: MonitorEntry[] };
	invalidateAction: () => void;
}) {
	const [isAddMonitorOpen, setIsAddMonitorOpen] = useState(false);
	const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);

	const mutationOpts = { onSuccess: invalidateAction };

	const updateMonitor = useMutation({ ...orpc.statusPage.updateMonitor.mutationOptions(), ...mutationOpts });
	const removeMonitor = useMutation({ ...orpc.statusPage.removeMonitor.mutationOptions(), ...mutationOpts });
	const removeSection = useMutation({ ...orpc.statusPage.removeSection.mutationOptions(), ...mutationOpts });

	const toggle = (entryId: string, field: ToggleField, value: boolean) => {
		updateMonitor.mutate({ id: entryId, [field]: value });
	};

	const ungrouped = page.monitors.filter((m) => !m.sectionId).sort((a, b) => a.sortOrder - b.sortOrder);
	const sections = [...page.sections].sort((a, b) => a.sortOrder - b.sortOrder);

	const isEmpty = page.monitors.length === 0 && page.sections.length === 0;

	return (
		<>
			<section className="border-b px-4 py-5 sm:px-6">
				<div className="flex items-center justify-between gap-3">
					<p className="font-medium text-sm">Monitors</p>
					<div className="flex gap-2">
						<Button onClick={() => setIsAddSectionOpen(true)} size="sm" variant="outline">
							<PlusIcon /> <span className="hidden sm:inline">Section</span>
						</Button>
						<Button onClick={() => setIsAddMonitorOpen(true)} size="sm">
							<PlusIcon /> <span className="hidden sm:inline">Monitor</span>
						</Button>
					</div>
				</div>
			</section>

			{isEmpty ? (
				<section className="border-b px-4 py-8 text-center sm:px-6">
					<HeartbeatIcon className="mx-auto size-8 text-muted-foreground" weight="duotone" />
					<p className="mt-2 text-balance font-medium text-sm">No monitors added yet</p>
					<Button className="mt-3" onClick={() => setIsAddMonitorOpen(true)} size="sm">
						<PlusIcon /> Add Monitor
					</Button>
				</section>
			) : null}

			{ungrouped.length > 0 ? (
				<MonitorList monitors={ungrouped} onRemoveAction={(id) => removeMonitor.mutate({ id })} onToggleAction={toggle} />
			) : null}

			{sections.map((s) => {
				const monitors = page.monitors.filter((m) => m.sectionId === s.id).sort((a, b) => a.sortOrder - b.sortOrder);
				return (
					<section className="border-b" key={s.id}>
						<div className="flex items-center justify-between px-4 py-2 sm:px-6">
							<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">{s.name}</p>
							<Button
								aria-label={`Delete section ${s.name}`}
								className="size-7 opacity-50 hover:opacity-100"
								onClick={() => removeSection.mutate({ id: s.id })}
								size="icon"
								variant="ghost"
							>
								<TrashIcon className="size-3.5 text-destructive" />
							</Button>
						</div>
						{monitors.length > 0 ? (
							<MonitorList monitors={monitors} onRemoveAction={(id) => removeMonitor.mutate({ id })} onToggleAction={toggle} />
						) : (
							<p className="px-4 py-4 text-center text-muted-foreground text-xs">No monitors in this section</p>
						)}
					</section>
				);
			})}

			{isAddMonitorOpen ? (
				<AddMonitorSheet
					existingScheduleIds={page.monitors.map((m) => m.scheduleId)}
					onCloseAction={() => setIsAddMonitorOpen(false)}
					onSaveAction={invalidateAction}
					open={isAddMonitorOpen}
					sections={page.sections}
					statusPageId={page.id}
				/>
			) : null}
			{isAddSectionOpen ? (
				<AddSectionSheet
					onCloseAction={() => setIsAddSectionOpen(false)}
					onSaveAction={invalidateAction}
					open={isAddSectionOpen}
					statusPageId={page.id}
				/>
			) : null}
		</>
	);
}

function MonitorList({
	monitors,
	onToggleAction,
	onRemoveAction,
}: {
	monitors: MonitorEntry[];
	onToggleAction: (id: string, field: ToggleField, value: boolean) => void;
	onRemoveAction: (id: string) => void;
}) {
	return (
		<div className="divide-y border-b">
			{monitors.map((entry) => {
				const s = entry.schedule;
				const name = entry.displayName ?? s?.name ?? s?.website?.name ?? s?.website?.domain ?? s?.url ?? "Unknown";
				const domain = s?.website?.domain ?? s?.url;
				return (
					<div className="flex items-start gap-3 px-4 py-3 sm:px-6" key={entry.id}>
						<div className="flex size-8 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
							{domain ? (
								<FaviconImage altText={`${name} favicon`} domain={domain} fallbackIcon={<HeartbeatIcon className="size-4" weight="duotone" />} size={16} />
							) : (
								<HeartbeatIcon className="size-4" weight="duotone" />
							)}
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-sm">{name}</p>
							<div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
								{TOGGLES.map((t) => (
									<span className="flex items-center gap-1.5 text-xs" key={t.key}>
										<Switch checked={entry[t.key]} className="scale-75" onCheckedChange={(v) => onToggleAction(entry.id, t.key, v)} />
										<span className="text-muted-foreground">{t.label}</span>
									</span>
								))}
							</div>
						</div>
						<Button
							aria-label="Remove monitor"
							className="size-7 shrink-0 opacity-50 hover:opacity-100"
							onClick={() => onRemoveAction(entry.id)}
							size="icon"
							variant="ghost"
						>
							<TrashIcon className="size-3.5 text-destructive" />
						</Button>
					</div>
				);
			})}
		</div>
	);
}
