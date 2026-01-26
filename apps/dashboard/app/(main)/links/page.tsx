"use client";

import {
	ArrowClockwiseIcon,
	PlusIcon,
	SparkleIcon,
	TrendDownIcon,
} from "@phosphor-icons/react/dist/ssr";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { NoticeBanner } from "@/app/(main)/websites/_components/notice-banner";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { type Link, useDeleteLink, useLinks } from "@/hooks/use-links";
import { LinksListSkeleton } from "./_components/link-item";
import { LinkSheet } from "./_components/link-sheet";
import { LinksList } from "./_components/links-list";
import { LinksSearchBar } from "./_components/links-search-bar";
import { QrCodeDialog } from "./_components/qr-code-dialog";

export default function LinksPage() {
	const router = useRouter();
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [editingLink, setEditingLink] = useState<Link | null>(null);
	const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);
	const [qrLink, setQrLink] = useState<Link | null>(null);
	const [filteredLinks, setFilteredLinks] = useState<Link[]>([]);

	const { links, isLoading, isError, isFetching, refetch } = useLinks();
	const deleteLinkMutation = useDeleteLink();

	const handleDeleteLink = async (linkId: string) => {
		try {
			await deleteLinkMutation.mutateAsync({ id: linkId });
			setDeletingLinkId(null);
		} catch (error) {
			console.error("Failed to delete link:", error);
		}
	};

	const handleFilteredLinksChange = useCallback((newFilteredLinks: Link[]) => {
		setFilteredLinks(newFilteredLinks);
	}, []);

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

	const displayLinks = isLoading ? [] : filteredLinks;
	const showEmptySearch =
		!isLoading && links.length > 0 && filteredLinks.length === 0;

	return (
		<div className="relative flex h-full flex-col">
			<PageHeader
				count={isLoading ? undefined : links.length}
				description="Create and track short links with analytics"
				icon={<LinkIcon weight="duotone" />}
				right={
					<>
						<Button
							disabled={isFetching}
							onClick={() => refetch()}
							variant="secondary"
						>
							<ArrowClockwiseIcon
								className={isFetching ? "animate-spin" : ""}
								size={16}
							/>
							Refresh
						</Button>
						<Button
							onClick={() => {
								setEditingLink(null);
								setIsSheetOpen(true);
							}}
						>
							<PlusIcon size={16} />
							Create Link
						</Button>
					</>
				}
				title="Links"
			/>

			<div className="px-3 pt-3 sm:px-4">
				<NoticeBanner
					description="Free while in beta"
					icon={<SparkleIcon />}
					title="Early Access"
				/>
			</div>

			{!isLoading && links.length > 0 && (
				<LinksSearchBar
					links={links}
					onFilteredLinksChange={handleFilteredLinksChange}
				/>
			)}

			{isLoading ? (
				<LinksListSkeleton />
			) : showEmptySearch ? (
				<div className="flex flex-1 items-center justify-center py-16">
					<div className="text-center">
						<p className="text-muted-foreground">No links match your search</p>
					</div>
				</div>
			) : (
				<LinksList
					isLoading={isLoading}
					links={displayLinks}
					onCreateLink={() => {
						setEditingLink(null);
						setIsSheetOpen(true);
					}}
					onDeleteLink={(linkId) => setDeletingLinkId(linkId)}
					onEditLink={(link) => {
						setEditingLink(link);
						setIsSheetOpen(true);
					}}
					onLinkClick={(link) => router.push(`/links/${link.id}`)}
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
	);
}
