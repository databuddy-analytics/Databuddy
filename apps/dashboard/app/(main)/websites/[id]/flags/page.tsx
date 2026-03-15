"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useAtom } from "jotai";
import { orpc } from "@/lib/orpc";
import {
	isFlagSheetOpenAtom,
	editingFlagAtom,
} from "@/stores/jotai/flagsAtoms";
import { FlagsList } from "./_components/flags-list";
import { FolderTree } from "./_components/folder-tree";
import type { Flag } from "./_components/types";

export default function FlagsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
	const [, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [, setEditingFlag] = useAtom(editingFlagAtom);
	const queryClient = useQueryClient();

	const {
		data: flags,
		isLoading: flagsLoading,
	} = useQuery({
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
	});

	const {
		data: groups,
	} = useQuery({
		...orpc.targetGroups.list.queryOptions({ input: { websiteId } }),
	});

	// Extract unique folders from flags
	const folders = useMemo(() => {
		if (!flags) return [];
		const folderSet = new Set<string>();
		for (const flag of flags) {
			if (flag.folder) {
				folderSet.add(flag.folder);
			}
		}
		return Array.from(folderSet).sort();
	}, [flags]);

	// Filter flags by selected folder
	const filteredFlags = useMemo(() => {
		if (!flags) return [];
		const activeFlags = flags.filter((f) => f.status !== "archived");
		if (selectedFolder === null) return activeFlags;
		if (selectedFolder === "__uncategorized__") {
			return activeFlags.filter((f) => !f.folder);
		}
		return activeFlags.filter(
			(f) => f.folder === selectedFolder || f.folder?.startsWith(selectedFolder + "/")
		);
	}, [flags, selectedFolder]);

	// Build groups map
	const groupsMap = useMemo(() => {
		const map = new Map<string, any[]>();
		if (groups && flags) {
			for (const flag of flags) {
				const flagGroups = groups.filter((g) =>
					flag.targetGroupIds?.includes(g.id)
				);
				if (flagGroups.length > 0) {
					map.set(flag.id, flagGroups);
				}
			}
		}
		return map;
	}, [flags, groups]);

	const handleCreateFolder = useCallback((name: string) => {
		// Folders are created implicitly when a flag is assigned to one
		// This just updates the UI state
		setSelectedFolder(name);
	}, []);

	if (flagsLoading) {
		return null;
	}

	return (
		<div className="flex h-full min-h-0 gap-0">
			{/* Folder Sidebar */}
			{folders.length > 0 && (
				<div className="w-56 shrink-0 border-r border-border overflow-y-auto py-2">
					<FolderTree
						folders={folders}
						selectedFolder={selectedFolder}
						onSelectFolder={setSelectedFolder}
						onCreateFolder={handleCreateFolder}
					/>
				</div>
			)}

			{/* Flags List */}
			<div className="flex-1 min-w-0 overflow-y-auto">
				<FlagsList
					flags={filteredFlags as Flag[]}
					groups={groupsMap}
					onEdit={(flag) => {
						setEditingFlag(flag);
						setIsFlagSheetOpen(true);
					}}
					onDelete={() => {
						queryClient.invalidateQueries({
							queryKey: orpc.flags.list.queryOptions({ input: { websiteId } }).queryKey,
						});
					}}
				/>
			</div>
		</div>
	);
}
