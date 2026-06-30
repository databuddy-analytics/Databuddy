"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { PageNavigation } from "@/components/layout/page-navigation";
import { TransferToOrgDialog } from "@/components/transfer-to-org-dialog";
import { getStatusPageUrl } from "@/lib/app-url";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { AddMonitorDialog } from "./_components/add-monitor-dialog";
import { IncidentsTab } from "./_components/incidents-tab";
import {
	type StatusPageMonitor,
	StatusPageMonitorRow,
} from "./_components/status-page-monitor-row";
import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	HeartbeatIcon,
	OpenExternalIcon as BrowserIcon,
	PlusIcon,
	SirenIcon,
} from "@databuddy/ui/icons";
import { DeleteDialog, Switch } from "@databuddy/ui/client";
import {
	Button,
	Card,
	EmptyState,
	Field,
	Skeleton,
	buttonVariants,
} from "@databuddy/ui";

type Tab = "monitors" | "incidents";

export default function StatusPageDetailsPage() {
	const params = useParams();
	const router = useRouter();
	const statusPageId = params.id as string;
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState<Tab>("monitors");
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isIncidentSheetOpen, setIsIncidentSheetOpen] = useState(false);
	const [isTransferOpen, setIsTransferOpen] = useState(false);
	const [includeMonitors, setIncludeMonitors] = useState(true);
	const [monitorToRemove, setMonitorToRemove] = useState<string | null>(null);

	const statusPageQuery = useQuery({
		...orpc.statusPage.get.queryOptions({ input: { statusPageId } }),
		enabled: !!statusPageId,
	});

	const transferMutation = useMutation({
		...orpc.statusPage.transfer.mutationOptions(),
	});

	const removeMutation = useMutation({
		...orpc.statusPage.removeMonitor.mutationOptions(),
		onSuccess: () => {
			invalidate();
			toast.success("Monitor removed");
			setMonitorToRemove(null);
		},
	});

	const statusPage = statusPageQuery.data;

	const monitorToRemoveData = statusPage?.monitors.find(
		(m: StatusPageMonitor) => m.id === monitorToRemove
	);

	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.statusPage.get.key({ input: { statusPageId } }),
		});
	};

	const handleTransfer = async (targetOrganizationId: string) => {
		try {
			await transferMutation.mutateAsync({
				statusPageId,
				targetOrganizationId,
				includeMonitors,
			});
			toast.success("Status page transferred successfully");
			setIsTransferOpen(false);
			router.push("/monitors/status-pages");
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: "Failed to transfer status page";
			toast.error(errorMessage);
		}
	};

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
		monitorsContent = (
			<div className="divide-y">
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						className="flex items-center gap-4 px-5 py-3"
						key={`skel-${i + 1}`}
					>
						<Skeleton className="size-8 shrink-0 rounded-lg" />
						<div className="min-w-0 flex-1 space-y-1.5">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-3 w-56" />
						</div>
					</div>
				))}
			</div>
		);
	} else if (statusPageQuery.isError) {
		monitorsContent = (
			<div className="px-5 py-12">
				<EmptyState
					action={{
						label: "Retry",
						onClick: () => statusPageQuery.refetch(),
					}}
					description="Something went wrong while loading the status page."
					icon={<BrowserIcon weight="duotone" />}
					title="Failed to load"
					variant="error"
				/>
			</div>
		);
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
					icon={<HeartbeatIcon weight="duotone" />}
					title="No monitors added"
				/>
			</div>
		);
	} else {
		monitorsContent = (
			<div className="divide-y">
				{statusPage?.monitors.map((monitor: StatusPageMonitor) => (
					<StatusPageMonitorRow
						key={monitor.id}
						monitor={monitor}
						onRemoveRequestAction={(id) => setMonitorToRemove(id)}
						statusPageId={statusPageId}
					/>
				))}
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
					<div className="mx-auto max-w-2xl space-y-6 p-5">
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
											<Link
												className={buttonVariants({
													size: "sm",
													variant: "secondary",
												})}
												href={getStatusPageUrl(statusPage.slug)}
												rel="noopener noreferrer"
												target="_blank"
											>
												View Page
											</Link>
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
												onClick={() => setIsTransferOpen(true)}
												size="sm"
												variant="secondary"
											>
												<ArrowSquareOutIcon
													className="size-3.5"
													weight="duotone"
												/>
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
									<HeartbeatIcon
										className="size-4"
										weight={activeTab === "monitors" ? "fill" : "duotone"}
									/>
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
									<SirenIcon
										className="size-4"
										weight={activeTab === "incidents" ? "fill" : "duotone"}
									/>
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

				<AddMonitorDialog
					existingMonitorIds={
						statusPage?.monitors.map(
							(m: StatusPageMonitor) => m.uptimeScheduleId
						) ?? []
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
					<TransferToOrgDialog
						currentOrganizationId={statusPage.organizationId}
						description={`Move "${statusPage.name}" to a different organization.`}
						isPending={transferMutation.isPending}
						onOpenChangeAction={setIsTransferOpen}
						onTransferAction={handleTransfer}
						open={isTransferOpen}
						title="Transfer Status Page"
						warning="The status page and its configuration will be transferred to {orgName}."
					>
						<div className="flex items-center justify-between rounded border p-3">
							<Field.Label
								className="cursor-pointer text-sm"
								htmlFor="include-monitors-detail"
							>
								Include all linked monitors
							</Field.Label>
							<Switch
								checked={includeMonitors}
								id="include-monitors-detail"
								onCheckedChange={setIncludeMonitors}
							/>
						</div>
					</TransferToOrgDialog>
				) : null}
			</div>
		</ErrorBoundary>
	);
}
