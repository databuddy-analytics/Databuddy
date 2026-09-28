"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { PageNavigation } from "@/components/layout/page-navigation";
import { invalidateMonitorQueries } from "@/components/monitors/monitor-sheet";
import { StatusPageTransferDialog } from "@/components/status-pages/status-page-row";
import { List } from "@/components/ui/composables/list";
import { getStatusPageUrl } from "@/lib/app-url";
import { orpc } from "@/lib/orpc";
import { StatusPageSheet } from "@/components/status-pages/status-page-sheet";
import { cn } from "@/lib/utils";
import { AddMonitorDialog } from "./_components/add-monitor-dialog";
import { IncidentsTab } from "./_components/incidents-tab";
import { StatusPageMonitorRow } from "./_components/status-page-monitor-row";
import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	GearIcon,
	HeartbeatIcon,
	OpenExternalIcon as BrowserIcon,
	PlusIcon,
	SirenIcon,
} from "@databuddy/ui/icons";
import { DeleteDialog } from "@databuddy/ui/client";
import {
	Button,
	Card,
	EmptyState,
	Skeleton,
	buttonVariants,
} from "@databuddy/ui";

type Tab = "monitors" | "incidents";

export default function StatusPageDetailsPage() {
	const { id: statusPageId } = useParams<{ id: string }>();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState<Tab>("monitors");
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isIncidentSheetOpen, setIsIncidentSheetOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isTransferOpen, setIsTransferOpen] = useState(false);
	const [monitorToRemove, setMonitorToRemove] = useState<string | null>(null);

	const statusPageQuery = useQuery({
		...orpc.statusPage.get.queryOptions({ input: { statusPageId } }),
		enabled: !!statusPageId,
	});

	const invalidate = () => invalidateMonitorQueries(queryClient);

	const removeMutation = useMutation({
		...orpc.statusPage.removeMonitor.mutationOptions(),
		onSuccess: () => {
			toast.success("Monitor removed");
			return invalidate();
		},
	});

	const statusPage = statusPageQuery.data;
	const statusPageUrl = statusPage && getStatusPageUrl(statusPage.slug);

	const monitorToRemoveData = statusPage?.monitors.find(
		(m) => m.id === monitorToRemove
	);

	const handleConfirmRemove = async () => {
		if (!monitorToRemoveData) {
			return;
		}
		await removeMutation.mutateAsync({
			statusPageId: monitorToRemoveData.statusPageId,
			uptimeScheduleId: monitorToRemoveData.uptimeScheduleId,
		});
	};

	const isLoading = statusPageQuery.isLoading;

	let monitorsContent: ReactNode;
	if (isLoading) {
		monitorsContent = <List.DefaultLoading />;
	} else if (statusPage?.monitors.length === 0) {
		monitorsContent = (
			<div className="px-5 py-12">
				<EmptyState
					action={
						<Button
							onClick={() => setIsDialogOpen(true)}
							size="sm"
							variant="secondary"
						>
							<PlusIcon className="size-3.5" />
							Add Monitor
						</Button>
					}
					description="Add an existing monitor or create a new one to display on this status page."
					icon={<HeartbeatIcon />}
					title="No monitors added"
				/>
			</div>
		);
	} else {
		monitorsContent = (
			<div className="divide-y">
				{statusPage?.monitors.map((monitor) => (
					<StatusPageMonitorRow
						key={monitor.id}
						monitor={monitor}
						onRemoveRequestAction={setMonitorToRemove}
						statusPageId={statusPageId}
					/>
				))}
			</div>
		);
	}

	if (statusPageQuery.isError && !statusPageQuery.data) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center p-6">
				<EmptyState
					action={{
						label: "Retry",
						onClick: () => statusPageQuery.refetch(),
					}}
					description="The status page could not be loaded. It may not exist or you may not have access."
					icon={<BrowserIcon />}
					title="Failed to load status page"
					variant="error"
				/>
			</div>
		);
	}

	return (
		<ErrorBoundary>
			<div className="flex h-full min-h-0 flex-col">
				<PageNavigation
					breadcrumb={{
						label: "Status Pages",
						href: "/monitors/status-pages",
					}}
					currentPage={statusPage?.name ?? "Status page"}
					variant="breadcrumb"
				/>

				<div className="flex-1 overflow-y-auto">
					<div className="space-y-6 p-5">
						<Card>
							<Card.Header className="flex-row items-start justify-between gap-4">
								<div>
									<Card.Title>
										{statusPage?.name ?? <Skeleton className="h-5 w-40" />}
									</Card.Title>
									<Card.Description>
										{isLoading
											? "Loading…"
											: `${statusPage?.monitors.length ?? 0} monitor${statusPage?.monitors.length === 1 ? "" : "s"} on this page`}
									</Card.Description>
								</div>
								<div className="flex items-center gap-2">
									{statusPage ? (
										<>
											{statusPageUrl && (
												<Link
													className={buttonVariants({
														size: "sm",
														variant: "secondary",
													})}
													href={statusPageUrl}
													rel="noopener noreferrer"
													target="_blank"
												>
													View Page
												</Link>
											)}
											<Button
												aria-label="Refresh data"
												disabled={
													statusPageQuery.isLoading ||
													statusPageQuery.isFetching
												}
												onClick={() => statusPageQuery.refetch()}
												size="sm"
												variant="ghost"
											>
												<ArrowClockwiseIcon
													className={cn(
														"size-3.5",
														(statusPageQuery.isLoading ||
															statusPageQuery.isFetching) &&
															"animate-spin"
													)}
												/>
											</Button>
											<Button
												aria-label="Edit status page"
												onClick={() => setIsEditOpen(true)}
												size="sm"
												variant="secondary"
											>
												<GearIcon className="size-3.5" />
												<span className="hidden sm:inline">Edit</span>
											</Button>
											<Button
												aria-label="Transfer status page"
												onClick={() => setIsTransferOpen(true)}
												size="sm"
												variant="secondary"
											>
												<ArrowSquareOutIcon className="size-3.5" />
												<span className="hidden sm:inline">Transfer</span>
											</Button>
											{activeTab === "monitors" ? (
												<Button onClick={() => setIsDialogOpen(true)} size="sm">
													<PlusIcon className="size-3.5" />
													Add Monitor
												</Button>
											) : (
												<Button
													onClick={() => setIsIncidentSheetOpen(true)}
													size="sm"
												>
													<PlusIcon className="size-3.5" />
													Report Incident
												</Button>
											)}
										</>
									) : (
										<>
											<Skeleton className="h-8 w-22 rounded" />
											<Skeleton className="size-8 rounded" />
											<Skeleton className="h-8 w-24 rounded" />
										</>
									)}
								</div>
							</Card.Header>

							<div className="flex h-10 shrink-0 border-border border-t bg-accent/30">
								<button
									className={cn(
										"relative flex cursor-pointer items-center gap-2 px-3 py-2.5 font-medium text-sm",
										activeTab === "monitors"
											? "text-foreground"
											: "text-muted-foreground hover:text-foreground"
									)}
									onClick={() => setActiveTab("monitors")}
									type="button"
								>
									<HeartbeatIcon className="size-4" />
									Monitors
									{activeTab === "monitors" && (
										<div className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-purple" />
									)}
								</button>
								<button
									className={cn(
										"relative flex cursor-pointer items-center gap-2 px-3 py-2.5 font-medium text-sm",
										activeTab === "incidents"
											? "text-foreground"
											: "text-muted-foreground hover:text-foreground"
									)}
									onClick={() => setActiveTab("incidents")}
									type="button"
								>
									<SirenIcon className="size-4" />
									Incidents
									{activeTab === "incidents" && (
										<div className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-purple" />
									)}
								</button>
							</div>

							<Card.Content className="p-0">
								{activeTab === "monitors" ? (
									monitorsContent
								) : (
									<IncidentsTab
										isSheetOpen={isIncidentSheetOpen}
										onSheetOpenChange={setIsIncidentSheetOpen}
										statusPageId={statusPageId}
									/>
								)}
							</Card.Content>
						</Card>
					</div>
				</div>

				{statusPage ? (
					<StatusPageSheet
						onCloseAction={setIsEditOpen}
						onSaveAction={() => statusPageQuery.refetch()}
						open={isEditOpen}
						statusPage={statusPage}
					/>
				) : null}

				<AddMonitorDialog
					existingMonitorIds={
						statusPage?.monitors.map((m) => m.uptimeScheduleId) ?? []
					}
					onCompleteAction={invalidate}
					onOpenChangeAction={setIsDialogOpen}
					open={isDialogOpen}
					statusPageId={statusPageId}
				/>

				<DeleteDialog
					confirmLabel="Remove"
					description="This monitor will no longer appear on the public status page."
					isDeleting={removeMutation.isPending}
					isOpen={monitorToRemove !== null}
					itemName={
						monitorToRemoveData?.uptimeSchedule.name ??
						monitorToRemoveData?.uptimeSchedule.url ??
						undefined
					}
					onClose={() => setMonitorToRemove(null)}
					onConfirm={handleConfirmRemove}
					title="Remove Monitor"
				/>

				{statusPage ? (
					<StatusPageTransferDialog
						onOpenChangeAction={setIsTransferOpen}
						onTransferredAction={() => router.push("/monitors/status-pages")}
						open={isTransferOpen}
						statusPage={statusPage}
					/>
				) : null}
			</div>
		</ErrorBoundary>
	);
}
