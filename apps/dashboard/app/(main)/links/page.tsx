"use client";

import { ErrorBoundary } from "@/components/error-boundary";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	type Link,
	type LinkSortOption,
	type LinkTypeFilter,
	useCreateLinkFolder,
	useDeleteLink,
	useLinkFolders,
	useLinksPaginated,
} from "@/hooks/use-links";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { DeepLinkSheet } from "./_components/deep-link-sheet";
import { LinkFolderSheet } from "./_components/link-folder-sheet";
import {
	LinksListSkeleton,
	LinksSearchBarSkeleton,
	LinksList,
} from "./_components/link-item";
import { LinkSheet } from "./_components/link-sheet";
import { LinksSearchBar } from "./_components/links-search-bar";
import { QrCodeDialog } from "./_components/qr-code-dialog";
import { VirtualizedLinksList } from "./_components/virtualized-links-list";
import {
	ArchiveIcon,
	LinkIcon as LinkSimpleIcon,
	LinkIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	RocketIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Card, EmptyState } from "@databuddy/ui";
import { DeleteDialog, DropdownMenu } from "@databuddy/ui/client";

type ActiveDialog =
	| { type: "deep-link" }
	| { id: string; type: "delete" }
	| { type: "folder" }
	| { link: Link | null; type: "link" }
	| { link: Link; type: "qr" }
	| null;

export default function LinksPage() {
	return (
		<Suspense fallback={null}>
			<LinksPageContent />
		</Suspense>
	);
}

function LinksPageContent() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const scrollRef = useRef<HTMLDivElement>(null);
	const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<LinkSortOption>("newest");
	const [typeFilter, setTypeFilter] = useState<LinkTypeFilter>("all");
	const [folderId, setFolderId] = useState<string | null | undefined>(
		undefined
	);
	const { activeOrganization, isSwitchingOrganization } =
		useOrganizationsContext();
	const organizationName = activeOrganization?.name ?? "this organization";

	const [debouncedSearch] = useDebouncedValue(search, { wait: 250 });

	const {
		links,
		isLoading,
		isError,
		refetch,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useLinksPaginated({
		search: debouncedSearch,
		sort,
		type: typeFilter,
		folderId,
	});
	const { folders } = useLinkFolders();
	const createFolder = useCreateLinkFolder();
	const deleteLink = useDeleteLink();
	const foldersById = useMemo(
		() => new Map(folders.map((folder) => [folder.id, folder.name])),
		[folders]
	);

	const hasActiveFilters =
		!!debouncedSearch.trim() || typeFilter !== "all" || folderId !== undefined;
	const busy = isLoading || isSwitchingOrganization;
	const hasLinks = links.length > 0;
	const hasFolders = folders.length > 0;
	const showToolbar = hasLinks || hasActiveFilters || hasFolders;
	const noResults = !(busy || hasLinks) && hasActiveFilters;
	const emptyWorkspace = !(busy || hasLinks || hasActiveFilters);
	const canMutateWorkspace = !isSwitchingOrganization;

	const openCreate = useCallback(() => {
		setActiveDialog({ link: null, type: "link" });
	}, []);

	const clearCommandParam = useCallback(() => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("command");
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}, [pathname, router, searchParams]);

	const openEdit = useCallback((link: Link) => {
		setActiveDialog({ link, type: "link" });
	}, []);

	useEffect(() => {
		if (isSwitchingOrganization) {
			return;
		}

		const command = searchParams.get("command");
		if (command === "create-link") {
			openCreate();
			clearCommandParam();
			return;
		}
		if (command === "create-folder") {
			setActiveDialog({ type: "folder" });
			clearCommandParam();
		}
	}, [clearCommandParam, isSwitchingOrganization, openCreate, searchParams]);

	const handleDelete = async (id: string) => {
		try {
			await deleteLink.mutateAsync({ id });
			setActiveDialog(null);
		} catch (error: unknown) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete link"
			);
		}
	};

	const handleCreateFolder = async (name: string) => {
		try {
			await createFolder.mutateAsync({ name });
			setActiveDialog(null);
			toast.success("Folder created");
		} catch (error: unknown) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create folder"
			);
		}
	};

	const sheetLink = activeDialog?.type === "link" ? activeDialog.link : null;
	const qrLink = activeDialog?.type === "qr" ? activeDialog.link : null;
	const deleteId = activeDialog?.type === "delete" ? activeDialog.id : null;
	const closeDialog = () => setActiveDialog(null);
	const closeDialogOnOpenChange = (open: boolean) => {
		if (!open) {
			closeDialog();
		}
	};

	return (
		<ErrorBoundary>
			<div className="flex-1 overflow-y-auto" ref={scrollRef}>
				<div className="mx-auto max-w-2xl space-y-6 p-5">
					<Card>
						<Card.Header className="flex-row items-start justify-between gap-4">
							<div>
								<div className="flex items-center gap-2">
									<Card.Title>Links</Card.Title>
									<Badge variant="muted">Beta</Badge>
								</div>
								<Card.Description>
									{isSwitchingOrganization
										? "Switching organization…"
										: emptyWorkspace
											? `${organizationName} does not have any links yet. Create short or deep links with organization-wide analytics.`
											: `Short and deep links for ${organizationName} · Free while in beta`}
								</Card.Description>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<Button
									disabled={!canMutateWorkspace}
									onClick={() => setActiveDialog({ type: "folder" })}
									size="sm"
									variant="secondary"
								>
									<ArchiveIcon className="size-3.5" weight="duotone" />
									Folder
								</Button>
								<DropdownMenu>
									<DropdownMenu.Trigger
										className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
										disabled={!canMutateWorkspace}
									>
										<PlusIcon size={14} />
										New Link
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end" className="w-44">
										<DropdownMenu.Item className="gap-2" onClick={openCreate}>
											<LinkSimpleIcon className="size-4" weight="duotone" />
											Short Link
										</DropdownMenu.Item>
										<DropdownMenu.Item
											className="gap-2"
											onClick={() => setActiveDialog({ type: "deep-link" })}
										>
											<RocketIcon className="size-4" weight="duotone" />
											Deep Link
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu>
							</div>
						</Card.Header>
						<Card.Content className="p-0">
							{busy ? (
								<>
									{isSwitchingOrganization && (
										<p className="sr-only" role="status">
											Switching organization…
										</p>
									)}
									<LinksSearchBarSkeleton />
									<LinksListSkeleton />
								</>
							) : showToolbar ? (
								<>
									<div className="border-b px-4 py-2">
										<LinksSearchBar
											folderId={folderId}
											folders={folders}
											onFolderChangeAction={setFolderId}
											onSearchQueryChangeAction={setSearch}
											onSortByChangeAction={setSort}
											onTypeFilterChangeAction={setTypeFilter}
											searchQuery={search}
											sortBy={sort}
											typeFilter={typeFilter}
										/>
									</div>
									{noResults ? (
										<div className="px-5 py-12">
											<EmptyState
												description={
													debouncedSearch.trim()
														? `No links match “${debouncedSearch}”`
														: "No links match the current filters"
												}
												icon={<MagnifyingGlassIcon weight="duotone" />}
												title="No results"
												variant="minimal"
											/>
										</div>
									) : (
										<VirtualizedLinksList
											fetchNextPage={fetchNextPage}
											foldersById={foldersById}
											hasNextPage={hasNextPage}
											isFetchingNextPage={isFetchingNextPage}
											links={links}
											onDelete={(id) => setActiveDialog({ id, type: "delete" })}
											onEdit={openEdit}
											onShowQr={(link) => setActiveDialog({ link, type: "qr" })}
											scrollRef={scrollRef}
										/>
									)}
								</>
							) : isError ? (
								<div className="px-5 py-12">
									<EmptyState
										action={{
											label: "Retry",
											onClick: () => refetch(),
										}}
										description="There was an issue fetching your links. Please try again."
										icon={<LinkIcon weight="duotone" />}
										title="Error loading links"
										variant="error"
									/>
								</div>
							) : (
								<LinksList
									foldersById={foldersById}
									links={[]}
									onCreateLink={openCreate}
									onDelete={(id) => setActiveDialog({ id, type: "delete" })}
									onEdit={openEdit}
									onShowQr={(link) => setActiveDialog({ link, type: "qr" })}
								/>
							)}
						</Card.Content>
					</Card>
				</div>
			</div>

			<LinkSheet
				link={sheetLink}
				onOpenChange={closeDialogOnOpenChange}
				open={activeDialog?.type === "link" && canMutateWorkspace}
			/>

			<DeepLinkSheet
				onOpenChange={closeDialogOnOpenChange}
				open={activeDialog?.type === "deep-link" && canMutateWorkspace}
			/>

			<LinkFolderSheet
				isCreating={createFolder.isPending}
				onCreate={handleCreateFolder}
				onOpenChange={closeDialogOnOpenChange}
				open={activeDialog?.type === "folder" && canMutateWorkspace}
			/>

			<QrCodeDialog
				link={qrLink}
				onOpenChange={closeDialogOnOpenChange}
				open={!!qrLink}
			/>

			{deleteId && (
				<DeleteDialog
					confirmLabel="Delete Link"
					description="Are you sure you want to delete this link? This action cannot be undone and will permanently remove all click data."
					isDeleting={deleteLink.isPending}
					isOpen={!!deleteId}
					onClose={closeDialog}
					onConfirm={() => handleDelete(deleteId)}
					title="Delete Link"
				/>
			)}
		</ErrorBoundary>
	);
}
