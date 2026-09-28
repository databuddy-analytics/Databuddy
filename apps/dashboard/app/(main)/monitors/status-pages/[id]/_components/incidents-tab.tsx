"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	CheckCircleIcon,
	PencilIcon,
	PlusIcon,
	SirenIcon,
	TrashIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { List } from "@/components/ui/composables/list";
import { IncidentSheet } from "./create-incident-sheet";
import { DeleteDialog } from "@databuddy/ui/client";
import { Button, EmptyState } from "@databuddy/ui";

const STATUS_LABELS: Record<string, string> = {
	investigating: "Investigating",
	identified: "Identified",
	monitoring: "Monitoring",
	resolved: "Resolved",
};

type Incident = Awaited<
	ReturnType<typeof orpc.statusPage.listIncidents.call>
>[number];

interface IncidentsTabProps {
	isSheetOpen: boolean;
	onSheetOpenChange: (open: boolean) => void;
	statusPageId: string;
}

export function IncidentsTab({
	statusPageId,
	isSheetOpen,
	onSheetOpenChange,
}: IncidentsTabProps) {
	const queryClient = useQueryClient();
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [updateTarget, setUpdateTarget] = useState<Incident | null>(null);

	const incidentsQuery = useQuery({
		...orpc.statusPage.listIncidents.queryOptions({
			input: { statusPageId },
		}),
	});

	const deleteMutation = useMutation({
		...orpc.statusPage.deleteIncident.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.statusPage.listIncidents.key({
					input: { statusPageId },
				}),
			});
			toast.success("Incident deleted");
		},
	});

	const incidents = incidentsQuery.data ?? [];

	return (
		<>
			{incidentsQuery.isLoading ? (
				<List.DefaultLoading />
			) : incidentsQuery.isError ? (
				<div className="px-5 py-12">
					<EmptyState
						action={{ label: "Retry", onClick: () => incidentsQuery.refetch() }}
						description="Something went wrong while loading incidents."
						icon={<SirenIcon />}
						title="Failed to load incidents"
						variant="error"
					/>
				</div>
			) : incidents.length === 0 ? (
				<div className="px-5 py-12">
					<EmptyState
						action={
							<Button
								onClick={() => onSheetOpenChange(true)}
								size="sm"
								variant="secondary"
							>
								<PlusIcon className="size-3.5" />
								Report Incident
							</Button>
						}
						description="Report an incident when something is wrong. It will appear on your public status page."
						icon={<SirenIcon />}
						title="No incidents"
					/>
				</div>
			) : (
				<div className="divide-y">
					{incidents.map((incident) => (
						<IncidentRow
							incident={incident}
							key={incident.id}
							onDelete={() => setDeleteTarget(incident.id)}
							onUpdate={() => setUpdateTarget(incident)}
						/>
					))}
				</div>
			)}

			<IncidentSheet
				onOpenChangeAction={onSheetOpenChange}
				open={isSheetOpen}
				statusPageId={statusPageId}
			/>

			{updateTarget && (
				<IncidentSheet
					incident={updateTarget}
					onOpenChangeAction={(v) => {
						if (!v) {
							setUpdateTarget(null);
						}
					}}
					open
					statusPageId={statusPageId}
				/>
			)}

			<DeleteDialog
				confirmLabel="Delete"
				description="This incident and all its updates will be permanently deleted."
				isDeleting={deleteMutation.isPending}
				isOpen={deleteTarget !== null}
				onClose={() => setDeleteTarget(null)}
				onConfirm={async () => {
					if (deleteTarget) {
						await deleteMutation.mutateAsync({ incidentId: deleteTarget });
					}
				}}
				title="Delete Incident"
			/>
		</>
	);
}

function formatDate(date: Date): string {
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function IncidentRow({
	incident,
	onDelete,
	onUpdate,
}: {
	incident: Incident;
	onDelete: () => void;
	onUpdate: () => void;
}) {
	const isResolved = incident.status === "resolved";

	const iconBg = isResolved
		? "bg-emerald-500/10"
		: incident.severity === "critical"
			? "bg-red-500/10"
			: incident.severity === "major"
				? "bg-amber-500/10"
				: "bg-muted";

	const StatusIcon = isResolved ? CheckCircleIcon : WarningCircleIcon;
	const iconColor = isResolved
		? "text-emerald-500"
		: incident.severity === "critical"
			? "text-red-500"
			: incident.severity === "major"
				? "text-amber-500"
				: "text-muted-foreground";

	const latestUpdate = incident.updates[0];

	return (
		<div className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-interactive-hover/30">
			<div
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded-lg",
					iconBg
				)}
			>
				<StatusIcon className={cn("size-4", iconColor)} />
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium text-[13px] text-foreground">
						{incident.title}
					</p>
					<span
						className={cn(
							"shrink-0 rounded px-1.5 py-0.5 font-semibold text-[10px] uppercase",
							incident.severity === "critical"
								? "bg-red-500/10 text-red-600 dark:text-red-400"
								: incident.severity === "major"
									? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
									: "bg-muted text-muted-foreground"
						)}
					>
						{incident.severity}
					</span>
				</div>
				<p className="text-muted-foreground text-xs">
					{STATUS_LABELS[incident.status] ?? incident.status}
					{" · "}
					{formatDate(incident.createdAt)}
					{latestUpdate && (
						<>
							{" · "}
							<span className="text-muted-foreground/60">
								{latestUpdate.message.length > 60
									? `${latestUpdate.message.slice(0, 60)}…`
									: latestUpdate.message}
							</span>
						</>
					)}
				</p>
			</div>

			<div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
				{!isResolved && (
					<Button
						aria-label="Post update"
						onClick={onUpdate}
						size="sm"
						variant="ghost"
					>
						<PencilIcon className="size-3.5" />
					</Button>
				)}
				<Button
					aria-label="Delete incident"
					onClick={onDelete}
					size="sm"
					variant="ghost"
				>
					<TrashIcon className="size-3.5 text-muted-foreground" />
				</Button>
			</div>
		</div>
	);
}
