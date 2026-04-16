"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { BrowserIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureAccessGate } from "@/components/feature-access-gate";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	type StatusPage,
	StatusPageRow,
	StatusPageRowSkeleton,
} from "@/components/status-pages/status-page-row";
import { StatusPageSheet } from "@/components/status-pages/status-page-sheet";
import { Button } from "@/components/ui/button";
import { List } from "@/components/ui/composables/list";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

export default function StatusPagesListPage() {
	const { hasAccess, isLoading: isAccessLoading } =
		useFeatureAccess("monitors");
	const { activeOrganizationId, activeOrganization } =
		useOrganizationsContext();
	const queryClient = useQueryClient();
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [editingStatusPage, setEditingStatusPage] = useState<StatusPage | null>(
		null
	);
	const [statusPageToDelete, setStatusPageToDelete] =
		useState<StatusPage | null>(null);

	const resolvedOrgId = activeOrganization?.id ?? activeOrganizationId ?? "";

	const statusPagesQuery = useQuery({
		...orpc.statusPage.list.queryOptions({
			input: { organizationId: resolvedOrgId },
		}),
		enabled: hasAccess && !!resolvedOrgId,
	});

	const deleteMutation = useMutation({
		...orpc.statusPage.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.statusPage.list.key(),
			});
			toast.success("Status page deleted");
			setStatusPageToDelete(null);
		},
	});

	const handleCreate = () => {
		setEditingStatusPage(null);
		setIsSheetOpen(true);
	};

	const handleEdit = (statusPage: StatusPage) => {
		setEditingStatusPage(statusPage);
		setIsSheetOpen(true);
	};

	const handleConfirmDelete = () => {
		if (!statusPageToDelete) {
			return;
		}
		deleteMutation.mutate({ statusPageId: statusPageToDelete.id });
	};

	const handleSheetClose = () => {
		setIsSheetOpen(false);
		setEditingStatusPage(null);
	};

	const statusPages = statusPagesQuery.data;
	const isLoading = isAccessLoading || statusPagesQuery.isLoading;
	const isError = statusPagesQuery.isError;

	return (
		<ErrorBoundary>
			<div className="h-full overflow-y-auto">
				<PageHeader
					count={hasAccess ? statusPages?.length : undefined}
					description="Create and manage public status pages"
					icon={<BrowserIcon />}
					right={
						hasAccess ? (
							<>
								<Button
									aria-label="Refresh status pages"
									disabled={
										statusPagesQuery.isLoading || statusPagesQuery.isFetching
									}
									onClick={() => statusPagesQuery.refetch()}
									size="icon"
									variant="outline"
								>
									<ArrowClockwiseIcon
										className={cn(
											(statusPagesQuery.isLoading ||
												statusPagesQuery.isFetching) &&
												"animate-spin"
										)}
									/>
								</Button>
								<Button onClick={handleCreate}>
									<PlusIcon />
									Create Status Page
								</Button>
							</>
						) : undefined
					}
					title="Status Pages"
				/>

				<FeatureAccessGate
					flagKey="monitors"
					loadingFallback={
						<div className="rounded bg-card">
							{Array.from({ length: 3 }).map((_, i) => (
								<StatusPageRowSkeleton key={`skeleton-${i + 1}`} />
							))}
						</div>
					}
				>
					{isLoading && (
						<div className="rounded bg-card">
							{Array.from({ length: 3 }).map((_, i) => (
								<StatusPageRowSkeleton key={`skeleton-${i + 1}`} />
							))}
						</div>
					)}

					{isError && (
						<div className="flex flex-1 items-center justify-center py-16">
							<EmptyState
								action={{
									label: "Retry",
									onClick: () => statusPagesQuery.refetch(),
								}}
								description="Something went wrong while fetching status pages."
								icon={<BrowserIcon weight="duotone" />}
								title="Failed to load"
								variant="error"
							/>
						</div>
					)}

					{!(isLoading || isError) &&
						statusPages &&
						statusPages.length === 0 && (
							<div className="flex flex-1 items-center justify-center py-16">
								<EmptyState
									action={{
										label: "Create Status Page",
										onClick: handleCreate,
									}}
									description="Create a public status page to keep your users informed about system availability."
									icon={<BrowserIcon weight="duotone" />}
									title="No status pages yet"
									variant="minimal"
								/>
							</div>
						)}

					{!(isLoading || isError) && statusPages && statusPages.length > 0 && (
						<List className="rounded bg-card">
							{statusPages.map((statusPage) => (
								<StatusPageRow
									key={statusPage.id}
									onDeleteAction={() => setStatusPageToDelete(statusPage)}
									onEditAction={() => handleEdit(statusPage)}
									onTransferSuccessAction={() => statusPagesQuery.refetch()}
									statusPage={statusPage}
								/>
							))}
						</List>
					)}
				</FeatureAccessGate>

				{isSheetOpen && (
					<Suspense fallback={null}>
						<StatusPageSheet
							onCloseAction={handleSheetClose}
							onSaveAction={statusPagesQuery.refetch}
							open={isSheetOpen}
							statusPage={editingStatusPage}
						/>
					</Suspense>
				)}

				<DeleteDialog
					isDeleting={deleteMutation.isPending}
					isOpen={statusPageToDelete !== null}
					itemName={statusPageToDelete?.name}
					onClose={() => setStatusPageToDelete(null)}
					onConfirm={handleConfirmDelete}
					title="Delete Status Page"
				/>
			</div>
		</ErrorBoundary>
	);
}
