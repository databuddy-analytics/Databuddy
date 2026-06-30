"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	type StatusPage,
	StatusPageRow,
} from "@/components/status-pages/status-page-row";
import { StatusPageSheet } from "@/components/status-pages/status-page-sheet";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	ArrowClockwiseIcon,
	MagnifyingGlassIcon,
	OpenExternalIcon as BrowserIcon,
	PlusIcon,
} from "@databuddy/ui/icons";
import { DeleteDialog } from "@databuddy/ui/client";
import { Badge, Button, Card, EmptyState, Skeleton } from "@databuddy/ui";
import { StatusPagesSearchBar } from "../_components/status-pages-search-bar";
import {
	type SortOption,
	type StatusFilter,
	useFilteredStatusPages,
} from "../_components/use-filtered-status-pages";

export default function StatusPagesListPage() {
	return (
		<Suspense fallback={null}>
			<StatusPagesListPageContent />
		</Suspense>
	);
}

function StatusPagesListPageContent() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const { activeOrganizationId, activeOrganization } =
		useOrganizationsContext();
	const queryClient = useQueryClient();
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<SortOption>("newest");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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
		enabled: !!resolvedOrgId,
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

	const clearCommandParam = useCallback(() => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("command");
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}, [pathname, router, searchParams]);

	const handleCreate = useCallback(() => {
		setEditingStatusPage(null);
		setIsSheetOpen(true);
	}, []);

	const handleEdit = (statusPage: StatusPage) => {
		setEditingStatusPage(statusPage);
		setIsSheetOpen(true);
	};

	const handleConfirmDelete = async () => {
		if (!statusPageToDelete) {
			return;
		}
		await deleteMutation.mutateAsync({ statusPageId: statusPageToDelete.id });
	};

	const handleSheetClose = () => {
		setIsSheetOpen(false);
		setEditingStatusPage(null);
	};

	useEffect(() => {
		if (searchParams.get("command") !== "create-status-page") {
			return;
		}
		handleCreate();
		clearCommandParam();
	}, [clearCommandParam, handleCreate, searchParams]);

	const statusPages = statusPagesQuery.data ?? [];
	const filtered = useFilteredStatusPages(
		statusPages,
		search,
		sort,
		statusFilter
	);
	const isLoading = statusPagesQuery.isLoading;
	const hasEmpty = statusPages.some((p) => p.monitorCount === 0);
	const hasPages = statusPages.length > 0;
	const noResults = !isLoading && hasPages && filtered.length === 0;

	return (
		<ErrorBoundary>
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-2xl space-y-6 p-5">
					<Card>
						<Card.Header className="flex-row items-start justify-between gap-4">
							<div>
								<div className="flex items-center gap-2">
									<Card.Title>Status Pages</Card.Title>
									<Badge variant="muted">Beta</Badge>
								</div>
								<Card.Description>
									{isLoading
										? "Loading status pages\u2026"
										: statusPages.length === 0
											? "Create and manage public status pages. Free while in beta."
											: `${statusPages.length} status page${statusPages.length === 1 ? "" : "s"} \u00b7 Free while in beta`}
								</Card.Description>
							</div>
							<div className="flex items-center gap-2">
								<Button
									aria-label="Refresh status pages"
									disabled={
										statusPagesQuery.isLoading || statusPagesQuery.isFetching
									}
									onClick={() => statusPagesQuery.refetch()}
									size="sm"
									variant="ghost"
								>
									<ArrowClockwiseIcon
										className={cn(
											"size-3.5",
											(statusPagesQuery.isLoading ||
												statusPagesQuery.isFetching) &&
												"animate-spin"
										)}
									/>
								</Button>
								<Button onClick={handleCreate} size="sm">
									<PlusIcon className="size-3.5" />
									Create Status Page
								</Button>
							</div>
						</Card.Header>
						<Card.Content className="p-0">
							{isLoading && (
								<div className="divide-y">
									{Array.from({ length: 3 }).map((_, i) => (
										<div
											className="flex items-center gap-4 px-5 py-3"
											key={`skel-${i + 1}`}
										>
											<Skeleton className="size-10 shrink-0 rounded-lg" />
											<div className="min-w-0 flex-1 space-y-2">
												<div className="flex items-center gap-2">
													<Skeleton className="h-4 w-40" />
													<Skeleton className="h-4 w-16 rounded-full" />
												</div>
												<Skeleton className="h-3.5 w-56" />
											</div>
										</div>
									))}
								</div>
							)}

							{!(isLoading || hasPages) && (
								<div className="px-5 py-12">
									<EmptyState
										action={
											<Button
												onClick={handleCreate}
												size="sm"
												variant="secondary"
											>
												<PlusIcon className="size-3.5" />
												Create Status Page
											</Button>
										}
										description="Create a public status page to keep your users informed about system availability."
										icon={<BrowserIcon weight="duotone" />}
										title="No status pages yet"
									/>
								</div>
							)}

							{!isLoading && hasPages && (
								<>
									<div className="border-b px-4 py-2">
										<StatusPagesSearchBar
											hasEmpty={hasEmpty}
											onSearchQueryChangeAction={setSearch}
											onSortByChangeAction={setSort}
											onStatusFilterChangeAction={setStatusFilter}
											searchQuery={search}
											sortBy={sort}
											statusFilter={statusFilter}
										/>
									</div>
									{noResults ? (
										<div className="px-5 py-12">
											<EmptyState
												description={`No status pages match \u201c${search}\u201d`}
												icon={<MagnifyingGlassIcon weight="duotone" />}
												title="No results"
												variant="minimal"
											/>
										</div>
									) : (
										<div className="divide-y">
											{filtered.map((statusPage) => (
												<StatusPageRow
													key={statusPage.id}
													onDeleteAction={() =>
														setStatusPageToDelete(statusPage)
													}
													onEditAction={() => handleEdit(statusPage)}
													onTransferSuccessAction={statusPagesQuery.refetch}
													statusPage={statusPage}
												/>
											))}
										</div>
									)}
								</>
							)}
						</Card.Content>
					</Card>
				</div>

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
