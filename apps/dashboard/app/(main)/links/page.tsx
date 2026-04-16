"use client";

import {
	ArrowClockwiseIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	TrendDownIcon,
} from "@phosphor-icons/react";
import { LinkIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { type Link, useDeleteLink, useLinks } from "@/hooks/use-links";
import {
	LinksList,
	LinksListSkeleton,
	LinksSearchBarSkeleton,
} from "./_components/link-item";
import { LinkSheet } from "./_components/link-sheet";
import { LinksSearchBar } from "./_components/links-search-bar";
import { QrCodeDialog } from "./_components/qr-code-dialog";
import {
	type SortOption,
	useFilteredLinks,
} from "./_components/use-filtered-links";

export default function LinksPage() {
	const [sheetLink, setSheetLink] = useState<Link | null>(null);
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [qrLink, setQrLink] = useState<Link | null>(null);
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<SortOption>("newest");

	const { links, isLoading, isError, isFetching, refetch } = useLinks();
	const deleteLink = useDeleteLink();
	const filtered = useFilteredLinks(links, search, sort);

	const busy = isLoading || isFetching;
	const hasLinks = links.length > 0;
	const noResults = !busy && hasLinks && filtered.length === 0;

	const openCreate = useCallback(() => {
		setSheetLink(null);
		setIsSheetOpen(true);
	}, []);

	const openEdit = useCallback((link: Link) => {
		setSheetLink(link);
		setIsSheetOpen(true);
	}, []);

	const closeSheet = useCallback(() => {
		setIsSheetOpen(false);
		setSheetLink(null);
	}, []);

	const handleDelete = async (id: string) => {
		try {
			await deleteLink.mutateAsync({ id });
			setDeleteId(null);
		} catch (error: unknown) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete link"
			);
		}
	};

	if (isError) {
		return (
			<div className="p-4">
				<Card className="border-destructive/20 bg-destructive/5">
					<CardContent className="pt-6">
						<div className="flex items-center gap-2">
							<TrendDownIcon
								className="size-5 text-destructive"
								weight="duotone"
							/>
							<p className="text-balance font-medium text-destructive">
								Error loading links
							</p>
						</div>
						<p className="mt-2 text-pretty text-destructive/80 text-sm">
							There was an issue fetching your links. Please try again.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<ErrorBoundary>
			<div className="flex h-full flex-col">
				<PageHeader
					badgeContent="Early Access"
					count={isLoading ? undefined : links.length}
					description="Create and track short links with analytics"
					icon={<LinkIcon weight="duotone" />}
					right={
						<>
							<Button
								aria-label="Refresh links"
								disabled={busy}
								onClick={() => refetch()}
								size="icon"
								variant="outline"
							>
								<ArrowClockwiseIcon
									className={busy ? "animate-spin" : ""}
									size={16}
								/>
							</Button>
							<Button onClick={openCreate}>
								<PlusIcon size={16} />
								Create Link
							</Button>
						</>
					}
					title="Links"
				/>

				{busy ? (
					<LinksSearchBarSkeleton />
				) : hasLinks ? (
					<div className="flex shrink-0 items-center border-b px-2 py-1.5">
						<LinksSearchBar
							onSearchQueryChangeAction={setSearch}
							onSortByChangeAction={setSort}
							searchQuery={search}
							sortBy={sort}
						/>
					</div>
				) : null}

				{busy ? (
					<LinksListSkeleton />
				) : noResults ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-2 py-16">
						<MagnifyingGlassIcon
							className="size-8 text-muted-foreground/40"
							weight="duotone"
						/>
						<p className="text-pretty text-muted-foreground text-sm">
							No links match &ldquo;{search}&rdquo;
						</p>
					</div>
				) : (
					<LinksList
						links={filtered}
						onCreateLink={openCreate}
						onDelete={setDeleteId}
						onEdit={openEdit}
						onShowQr={setQrLink}
					/>
				)}

				<LinkSheet
					link={sheetLink}
					onOpenChange={(open) => (open ? setIsSheetOpen(true) : closeSheet())}
					open={isSheetOpen}
				/>

				<QrCodeDialog
					link={qrLink}
					onOpenChange={(open) => {
						if (!open) {
							setQrLink(null);
						}
					}}
					open={!!qrLink}
				/>

				{deleteId && (
					<DeleteDialog
						confirmLabel="Delete Link"
						description="Are you sure you want to delete this link? This action cannot be undone and will permanently remove all click data."
						isDeleting={deleteLink.isPending}
						isOpen={!!deleteId}
						onClose={() => setDeleteId(null)}
						onConfirm={() => handleDelete(deleteId)}
						title="Delete Link"
					/>
				)}
			</div>
		</ErrorBoundary>
	);
}
