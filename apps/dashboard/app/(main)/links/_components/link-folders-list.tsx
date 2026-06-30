"use client";

import { type ReactNode, useMemo } from "react";
import type { Link, LinkFolder } from "@/hooks/use-links";
import { ArchiveIcon, FolderSimpleIcon, LinkIcon } from "@databuddy/ui/icons";
import { LinksList } from "./link-item";
import { EmptyState } from "@databuddy/ui";
import { Accordion } from "@databuddy/ui/client";

interface LinkFoldersListProps {
	folders: LinkFolder[];
	foldersById: Map<string, string>;
	links: Link[];
	onCreateLink: () => void;
	onDelete: (linkId: string) => void;
	onEdit: (link: Link) => void;
	onShowQr: (link: Link) => void;
}

interface FolderSection {
	icon: ReactNode;
	id: string;
	links: Link[];
	name: string;
}

function groupLinksByFolder(links: Link[]) {
	const grouped = new Map<string, Link[]>();
	for (const link of links) {
		const key = link.folderId ?? "unfiled";
		grouped.set(key, [...(grouped.get(key) ?? []), link]);
	}
	return grouped;
}

function FolderEmptyState({ title }: { title: string }) {
	return (
		<div className="border-border/60 border-t px-5 py-6">
			<EmptyState
				description="New links assigned here will show up in this folder."
				icon={<LinkIcon weight="regular" />}
				title={title}
				variant="minimal"
			/>
		</div>
	);
}

export function LinkFoldersList({
	folders,
	foldersById,
	links,
	onCreateLink,
	onDelete,
	onEdit,
	onShowQr,
}: LinkFoldersListProps) {
	const sections = useMemo<FolderSection[]>(() => {
		const grouped = groupLinksByFolder(links);
		const folderSections = folders.map((folder) => ({
			id: folder.id,
			icon: <FolderSimpleIcon className="size-4" weight="duotone" />,
			links: grouped.get(folder.id) ?? [],
			name: folder.name,
		}));
		const unfiledLinks = grouped.get("unfiled") ?? [];

		if (unfiledLinks.length > 0 || folders.length === 0) {
			return [
				{
					id: "unfiled",
					icon: <ArchiveIcon className="size-4" weight="duotone" />,
					links: unfiledLinks,
					name: "Unfiled",
				},
				...folderSections,
			];
		}

		return folderSections;
	}, [folders, links]);

	if (sections.length === 0) {
		return (
			<LinksList
				foldersById={foldersById}
				links={[]}
				onCreateLink={onCreateLink}
				onDelete={onDelete}
				onEdit={onEdit}
				onShowQr={onShowQr}
			/>
		);
	}

	return (
		<div className="divide-y">
			{sections.map((section) => (
				<Accordion defaultOpen key={section.id}>
					<Accordion.Trigger className="h-10 bg-background px-5">
						{section.icon}
						<span className="truncate font-medium text-foreground text-sm">
							{section.name}
						</span>
						<span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
							{section.links.length}
						</span>
					</Accordion.Trigger>
					<Accordion.Panel>
						{section.links.length > 0 ? (
							<LinksList
								links={section.links}
								onCreateLink={onCreateLink}
								onDelete={onDelete}
								onEdit={onEdit}
								onShowQr={onShowQr}
								showEmptyState={false}
							/>
						) : (
							<FolderEmptyState title={`No links in ${section.name}`} />
						)}
					</Accordion.Panel>
				</Accordion>
			))}
		</div>
	);
}
