"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/layout/top-bar";
import { ErrorBoundary } from "@/components/error-boundary";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	type StatusPage,
	StatusPageRow,
} from "@/components/status-pages/status-page-row";
import { StatusPageSheet } from "@/components/status-pages/status-page-sheet";
import { invalidateMonitorQueries } from "@/components/monitors/monitor-sheet";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	ArrowClockwiseIcon,
	MagnifyingGlassIcon,
	OpenExternalIcon as BrowserIcon,
	PlusIcon,
} from "@databuddy/ui/icons";
import { DeleteDialog } from "@databuddy/ui/client";
import { List } from "@/components/ui/composables/list";
import { Button, Card, EmptyState } from "@databuddy/ui";
import { ListSearchBar } from "../_components/monitors-search-bar";
import {
	type SortOption,
	useFilteredList,
} from "../_components/use-filtered-monitors";

type StatusFilter = "all" | "active" | "empty";

const STATUS_LABELS: Record<StatusFilter, string> = {
	all: "All",
	active: "Active",
	empty: "Empty",
};

const statusPageSearchFields = (
	page: StatusPage
): [string, ...(string | null)[]] => [page.name, page.slug, page.description];

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
			toast.success("Status page deleted");
			return invalidateMonitorQueries(queryClient);
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
		setEditingStatusPage(null);
		setIsSheetOpen(true);
		const params = new URLSearchParams(searchParams.toString());
		params.delete("command");
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}, [pathname, router, searchParams]);

	const statusPages = statusPagesQuery.data ?? [];
	const filtered = useFilteredList(
		statusFilter === "all"
			? statusPages
			: statusPages.filter(
					(p) => p.monitorCount > 0 === (statusFilter === "active")
				),
		search,
		sort,
		statusPageSearchFields
	);
	const isLoading = statusPagesQuery.isLoading || !resolvedOrgId;
	const hasEmpty = statusPages.some((p) => p.monitorCount === 0);
	const hasPages = statusPages.length > 0;
	const noResults = !isLoading && hasPages && filtered.length === 0;

	return (
		<ErrorBoundary>
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Status Pages</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					aria-label="Refresh status pages"
					disabled={statusPagesQuery.isLoading || statusPagesQuery.isFetching}
					onClick={() => statusPagesQuery.refetch()}
					size="sm"
					variant="secondary"
				>
					<ArrowClockwiseIcon
						className={cn(
							"size-4 shrink-0",
							(statusPagesQuery.isLoading || statusPagesQuery.isFetching) &&
								"animate-spin"
						)}
					/>
				</Button>
				<Button onClick={handleCreate} size="sm">
					<PlusIcon className="size-4 shrink-0" />
					Create Status Page
				</Button>
			</TopBar.Actions>
			<div className="flex-1 overflow-y-auto">
				<div className="space-y-6 p-5">
					<Card>
						<Card.Content className="p-0">
							{isLoading && <List.DefaultLoading />}

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
										icon={<BrowserIcon />}
										title="No status pages yet"
									/>
								</div>
							)}

							{!isLoading && hasPages && (
								<>
									<div className="border-b px-4 py-2">
										<ListSearchBar
											onSearchQueryChangeAction={setSearch}
											onSortByChangeAction={setSort}
											onStatusFilterChangeAction={setStatusFilter}
											placeholder="Search status pages"
											searchQuery={search}
											showStatusFilter={hasEmpty || statusFilter !== "all"}
											sortBy={sort}
											statusFilter={statusFilter}
											statusLabels={STATUS_LABELS}
										/>
									</div>
									{noResults ? (
										<div className="px-5 py-12">
											<EmptyState
												description={
													search
														? `No status pages match \u201c${search}\u201d`
														: "No status pages match the current filter"
												}
												icon={<MagnifyingGlassIcon />}
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
