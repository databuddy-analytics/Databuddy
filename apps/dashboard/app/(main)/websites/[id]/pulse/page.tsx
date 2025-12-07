"use client";

import { HeartbeatIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { WebsitePageHeader } from "../_components/website-page-header";
import { MonitorCard } from "./_components/monitor-card";
import { MonitorDialog } from "./_components/monitor-dialog";

export default function PulsePage() {
	const { id: websiteId } = useParams();
	const { data: website } = useWebsite(websiteId as string);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<{
		id: string;
		granularity: string;
	} | null>(null);

	const {
		data: schedule,
		isLoading,
		refetch: refetchSchedule,
	} = useQuery({
		...orpc.uptime.getScheduleByWebsiteId.queryOptions({
			input: { websiteId: websiteId as string },
		}),
	});

	const deleteMutation = useMutation({
		...orpc.uptime.deleteSchedule.mutationOptions(),
	});

	const hasMonitor = !!schedule;

	const handleCreateMonitor = () => {
		setEditingSchedule(null);
		setIsDialogOpen(true);
	};

	const handleEditMonitor = () => {
		if (schedule) {
			setEditingSchedule({
				id: schedule.id,
				granularity: schedule.granularity,
			});
			setIsDialogOpen(true);
		}
	};

	const handleDeleteMonitor = () => {
		setIsDeleteDialogOpen(true);
	};

	const handleConfirmDelete = async () => {
		if (!schedule) return;

		try {
			await deleteMutation.mutateAsync({ scheduleId: schedule.id });
			toast.success("Monitor deleted successfully");
			setIsDeleteDialogOpen(false);
			await refetchSchedule();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to delete monitor";
			toast.error(errorMessage);
		}
	};

	const handleMonitorSaved = async () => {
		setIsDialogOpen(false);
		setEditingSchedule(null);
		await refetchSchedule();
	};

	const handleRefetch = async () => {
		await refetchSchedule();
	};

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<WebsitePageHeader
				description="Monitor your website's uptime and availability"
				icon={
					<HeartbeatIcon
						className="size-6 text-accent-foreground"
						size={16}
						weight="duotone"
					/>
				}
				title="Uptime"
				websiteId={websiteId as string}
				websiteName={website?.name || undefined}
			/>
			<div className="flex-1 p-4">
				{hasMonitor && schedule ? (
					<MonitorCard
						onDelete={handleDeleteMonitor}
						onEdit={handleEditMonitor}
						onRefetch={handleRefetch}
						schedule={schedule}
					/>
				) : (
					<EmptyState
						action={{
							label: "Create Monitor",
							onClick: handleCreateMonitor,
						}}
						className="h-full py-0"
						description="Set up uptime monitoring to track your website's availability and receive alerts when it goes down."
						icon={<HeartbeatIcon weight="duotone" />}
						title="No monitor configured"
						variant="minimal"
					/>
				)}
			</div>

			<MonitorDialog
				onCloseAction={setIsDialogOpen}
				onSaveAction={handleMonitorSaved}
				open={isDialogOpen}
				schedule={editingSchedule}
				websiteId={websiteId as string}
			/>

			<DeleteDialog
				confirmLabel="Delete Monitor"
				description="Are you sure you want to delete this monitor? This will stop all uptime checks and cannot be undone."
				isDeleting={deleteMutation.isPending}
				isOpen={isDeleteDialogOpen}
				onClose={() => setIsDeleteDialogOpen(false)}
				onConfirm={handleConfirmDelete}
				title="Delete Monitor"
			/>
		</div>
	);
}
