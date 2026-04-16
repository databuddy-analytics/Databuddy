"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { HeartbeatIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react";
import { UserPlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureAccessGate } from "@/components/feature-access-gate";
import { MonitorRow } from "@/components/monitors/monitor-row";
import { MonitorSheet } from "@/components/monitors/monitor-sheet";
import { FeatureInviteDialog } from "@/components/organizations/feature-invite-dialog";
import { Button } from "@/components/ui/button";
import { List } from "@/components/ui/composables/list";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import type { ListQuerySlice } from "@/lib/list-query-outcome";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

export interface Monitor {
	cacheBust: boolean;
	createdAt: Date | string;
	cron: string;
	granularity: string;
	id: string;
	isPaused: boolean;
	jsonParsingConfig?: {
		enabled: boolean;
	} | null;
	name: string | null;
	organizationId: string;
	timeout: number | null;
	updatedAt: Date | string;
	url: string | null;
	website: {
		id: string;
		name: string | null;
		domain: string;
	} | null;
	websiteId: string | null;
}

export default function MonitorsPage() {
	const { hasAccess, isLoading: isAccessLoading } =
		useFeatureAccess("monitors");
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [showInviteDialog, setShowInviteDialog] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<{
		id: string;
		url: string;
		name?: string | null;
		granularity: string;
		timeout?: number | null;
		cacheBust?: boolean;
		jsonParsingConfig?: {
			enabled: boolean;
		} | null;
	} | null>(null);

	const schedulesQuery = useQuery({
		...orpc.uptime.listSchedules.queryOptions({ input: {} }),
		enabled: hasAccess,
	});

	const handleCreate = () => {
		setEditingSchedule(null);
		setIsSheetOpen(true);
	};

	const handleEdit = (schedule: Monitor) => {
		setEditingSchedule({
			id: schedule.id,
			url: schedule.url ?? "",
			name: schedule.name,
			granularity: schedule.granularity,
			timeout: schedule.timeout,
			cacheBust: schedule.cacheBust,
			jsonParsingConfig: schedule.jsonParsingConfig,
		});
		setIsSheetOpen(true);
	};

	const handleDelete = () => {
		schedulesQuery.refetch();
	};

	const handleSheetClose = () => {
		setIsSheetOpen(false);
		setEditingSchedule(null);
	};

	return (
		<ErrorBoundary>
			<div className="h-full overflow-y-auto">
				<PageHeader
					count={hasAccess ? schedulesQuery.data?.length : undefined}
					description="View and manage all your uptime monitors"
					icon={<HeartbeatIcon />}
					right={
						hasAccess ? (
							<>
								<Button
									onClick={() => setShowInviteDialog(true)}
									variant="outline"
								>
									<UserPlusIcon weight="duotone" />
									Invite
								</Button>
								<Button
									aria-label="Refresh monitors"
									disabled={
										schedulesQuery.isLoading || schedulesQuery.isFetching
									}
									onClick={() => schedulesQuery.refetch()}
									size="icon"
									variant="outline"
								>
									<ArrowClockwiseIcon
										className={cn(
											(schedulesQuery.isLoading || schedulesQuery.isFetching) &&
												"animate-spin"
										)}
									/>
								</Button>
								<Button onClick={handleCreate}>
									<PlusIcon />
									Create Monitor
								</Button>
							</>
						) : undefined
					}
					title="Monitors"
				/>

				<FeatureAccessGate
					flagKey="monitors"
					loadingFallback={<List.DefaultLoading />}
				>
					<List.Content<Monitor>
						emptyProps={{
							action: {
								label: "Create Your First Monitor",
								onClick: handleCreate,
							},
							description:
								"Create your first uptime monitor to start tracking availability and receive alerts when services go down.",
							icon: <HeartbeatIcon weight="duotone" />,
							title: "No monitors yet",
						}}
						errorProps={{
							action: {
								label: "Retry",
								onClick: () => schedulesQuery.refetch(),
							},
							description: "Something went wrong while fetching monitors.",
							icon: <HeartbeatIcon />,
							title: "Failed to load monitors",
						}}
						gatePending={isAccessLoading}
						query={schedulesQuery as ListQuerySlice<Monitor>}
					>
						{(items) => (
							<List className="rounded bg-card">
								{items.map((monitor) => (
									<MonitorRow
										key={monitor.id}
										onDeleteAction={handleDelete}
										onEditAction={() => handleEdit(monitor)}
										onRefetchAction={schedulesQuery.refetch}
										schedule={monitor}
									/>
								))}
							</List>
						)}
					</List.Content>
				</FeatureAccessGate>

				{isSheetOpen && (
					<Suspense fallback={null}>
						<MonitorSheet
							onCloseAction={handleSheetClose}
							onSaveAction={schedulesQuery.refetch}
							open={isSheetOpen}
							schedule={editingSchedule}
						/>
					</Suspense>
				)}
				{showInviteDialog && (
					<FeatureInviteDialog
						flagKey="monitors"
						onOpenChangeAction={setShowInviteDialog}
						open={showInviteDialog}
					/>
				)}
			</div>
		</ErrorBoundary>
	);
}
