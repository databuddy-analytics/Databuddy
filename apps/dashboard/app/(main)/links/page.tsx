"use client";

import {
	ArrowClockwiseIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	TrendDownIcon,
} from "@phosphor-icons/react/dist/ssr";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { type Link, useDeleteLink, useLinks } from "@/hooks/use-links";
import { LinksList, LinksListSkeleton } from "./_components/link-item";
import { LinkSheet } from "./_components/link-sheet";
import { LinksSearchBar } from "./_components/links-search-bar";
import { QrCodeDialog } from "./_components/qr-code-dialog";
import {
	type SortOption,
	useFilteredLinks,
} from "./_components/use-filtered-links";

export default function LinksPage() {
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [editingLink, setEditingLink] = useState<Link | null>(null);
	const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);
	const [qrLink, setQrLink] = useState<Link | null>(null);

	const [searchQuery, setSearchQuery] = useState("");
	const [sortBy, setSortBy] = useState<SortOption>("newest");

	const { links, isLoading, isError, isFetching, refetch } = useLinks();
	const deleteLinkMutation = useDeleteLink();

	const filteredLinks = useFilteredLinks(links, searchQuery, sortBy);

	const handleDeleteLink = async (linkId: string) => {
		try {
			await deleteLinkMutation.mutateAsync({ id: linkId });
			setDeletingLinkId(null);
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : "Failed to delete link";
			toast.error(message);
		}
	};

	const handleShowQr = useCallback((link: Link) => {
		setQrLink(link);
	}, []);

	const handleCreateLink = useCallback(() => {
		setEditingLink(null);
		setIsSheetOpen(true);
	}, []);

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

	const displayLinks = isLoading ? [] : filteredLinks;
	const showEmptySearch =
		!isLoading && links.length > 0 && filteredLinks.length === 0;
	const hasLinks = !isLoading && links.length > 0;

	return (
		<ErrorBoundary>
			<div className="flex h-full flex-col">
				<PageHeader
					badgeContent="Early Access"
					className="h-[88px]"
					count={isLoading ? undefined : links.length}
					description="Create and track short links with analytics"
					icon={<LinkIcon weight="duotone" />}
					right={
						<>
							<Button
								aria-label="Refresh links"
								disabled={isFetching}
								onClick={() => refetch()}
								size="icon"
								variant="secondary"
							>
								<ArrowClockwiseIcon
									className={isFetching ? "animate-spin" : ""}
									size={16}
								/>
							</Button>
							<Button onClick={handleCreateLink}>
								<PlusIcon size={16} />
								Create Link
							</Button>
						</>
					}
					title="Links"
				/>

				{hasLinks && (
					<div className="flex shrink-0 items-center border-b px-2 py-1.5">
						<LinksSearchBar
							onSearchQueryChangeAction={setSearchQuery}
							onSortByChangeAction={setSortBy}
							searchQuery={searchQuery}
							sortBy={sortBy}
						/>
					</div>
				)}

				{isLoading ? (
					<LinksListSkeleton />
				) : showEmptySearch ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-2 py-16">
						<MagnifyingGlassIcon
							className="size-8 text-muted-foreground/40"
							weight="duotone"
						/>
						<p className="text-pretty text-muted-foreground text-sm">
							No links match &ldquo;{searchQuery}&rdquo;
						</p>
					</div>
				) : (
					<LinksList
						links={displayLinks}
						onCreateLink={handleCreateLink}
						onDelete={(linkId) => setDeletingLinkId(linkId)}
						onEdit={(link) => {
							setEditingLink(link);
							setIsSheetOpen(true);
						}}
						onShowQr={handleShowQr}
					/>
				)}

				<LinkSheet
					link={editingLink}
					onOpenChange={(open) => {
						if (open) {
							setIsSheetOpen(true);
						} else {
							setIsSheetOpen(false);
							setEditingLink(null);
						}
					}}
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

				{deletingLinkId && (
					<DeleteDialog
						confirmLabel="Delete Link"
						description="Are you sure you want to delete this link? This action cannot be undone and will permanently remove all click data."
						isDeleting={deleteLinkMutation.isPending}
						isOpen={!!deletingLinkId}
						onClose={() => setDeletingLinkId(null)}
						onConfirm={() => deletingLinkId && handleDeleteLink(deletingLinkId)}
						title="Delete Link"
					/>
				)}
			</div>
		</ErrorBoundary>
	);
}
