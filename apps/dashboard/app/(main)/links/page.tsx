"use client";

import { SparkleIcon, TrendDownIcon } from "@phosphor-icons/react/dist/ssr";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { type Link, useDeleteLink, useLinks } from "@/hooks/use-links";
import { useOrganizationMembers } from "@/hooks/use-organizations";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { LinkSheet } from "./_components/link-sheet";
import { LinksPageHeader } from "./_components/links-page-header";
import { LinksFilters } from "./_components/links-filters";
import { LinksTable } from "./_components/links-table";
import { QrCodeDialog } from "./_components/qr-code-dialog";
import { EmptyState } from "@/components/empty-state";

type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";

export default function LinksPage() {
	const router = useRouter();
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [editingLink, setEditingLink] = useState<Link | null>(null);
	const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);
	const [qrLink, setQrLink] = useState<Link | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [sortBy, setSortBy] = useState<SortOption>("newest");

	const { links, isLoading, isError, isFetching, refetch } = useLinks();
	const deleteLinkMutation = useDeleteLink();
	const { activeOrganization } = useOrganizationsContext();
	const orgMembersResult = useOrganizationMembers(activeOrganization?.id ?? "");
	const members =
		Array.isArray(orgMembersResult.members) && orgMembersResult.members.length > 0
			? orgMembersResult.members
			: [];

	const [debouncedSearch] = useDebouncedValue(searchQuery, {
		wait: 200,
	});

	const filteredAndSortedLinks = useMemo(() => {
		let result = [...links];

		// Filter by search query
		if (debouncedSearch.trim()) {
			const query = debouncedSearch.toLowerCase();
			result = result.filter(
				(link) =>
					link.name.toLowerCase().includes(query) ||
					link.slug.toLowerCase().includes(query) ||
					link.targetUrl.toLowerCase().includes(query)
			);
		}

		// Sort
		switch (sortBy) {
			case "newest":
				result.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
				break;
			case "oldest":
				result.sort(
					(a, b) =>
						new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
				);
				break;
			case "name-asc":
				result.sort((a, b) => a.name.localeCompare(b.name));
				break;
			case "name-desc":
				result.sort((a, b) => b.name.localeCompare(a.name));
				break;
		}

		return result;
	}, [links, debouncedSearch, sortBy]);

	const handleDeleteLink = async (linkId: string) => {
		try {
			await deleteLinkMutation.mutateAsync({ id: linkId });
			setDeletingLinkId(null);
		} catch (error) {
			console.error("Failed to delete link:", error);
		}
	};

	const handleShowQr = useCallback((link: Link) => {
		setQrLink(link);
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
							<p className="font-medium text-destructive">
								Error loading links
							</p>
						</div>
						<p className="mt-2 text-destructive/80 text-sm">
							There was an issue fetching your links. Please try again.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const showEmptySearch =
		!isLoading && links.length > 0 && filteredAndSortedLinks.length === 0;

	return (
		<div className="relative flex h-full flex-col">
			<LinksPageHeader
				createActionLabel="Create Link"
				currentCount={links.length}
				icon={
					<LinkIcon
						className="size-6 text-accent-foreground"
						weight="duotone"
					/>
				}
				isLoading={isLoading}
				isRefreshing={isFetching}
				onCreateAction={() => {
					setEditingLink(null);
					setIsSheetOpen(true);
				}}
				onRefreshAction={() => refetch()}
				title="Links"
			/>

			{(isLoading || links.length > 0) && (
				<LinksFilters
					searchQuery={searchQuery}
					sortBy={sortBy}
					onSearchChange={setSearchQuery}
					onSortChange={setSortBy}
				/>
			)}

			<div className="flex-1 overflow-auto">
				{isLoading ? (
					<LinksTable
						isLoading={true}
						links={[]}
						onDeleteLink={() => {}}
						onEditLink={() => {}}
						onLinkClick={() => {}}
						onShowQr={() => {}}
					/>
				) : showEmptySearch ? (
					<div className="flex flex-1 items-center justify-center py-16">
						<div className="text-center">
							<p className="text-muted-foreground">No links match your search</p>
						</div>
					</div>
				) : filteredAndSortedLinks.length === 0 ? (
					<div className="flex flex-1 items-center justify-center py-16">
						<EmptyState
							action={{
								label: "Create Your First Link",
								onClick: () => {
									setEditingLink(null);
									setIsSheetOpen(true);
								},
							}}
							description="Create short links to track clicks and measure engagement across your marketing campaigns."
							icon={<LinkIcon weight="duotone" />}
							title="No links yet"
							variant="minimal"
						/>
					</div>
				) : (
					<LinksTable
						isLoading={false}
						links={filteredAndSortedLinks}
						members={members}
						onDeleteLink={(linkId) => setDeletingLinkId(linkId)}
						onEditLink={(link) => {
							setEditingLink(link);
							setIsSheetOpen(true);
						}}
						onLinkClick={(link) => router.push(`/links/${link.id}`)}
						onShowQr={handleShowQr}
					/>
				)}
			</div>

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
	);
}
