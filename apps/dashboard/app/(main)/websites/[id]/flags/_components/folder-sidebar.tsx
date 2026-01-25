"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { orpc } from "@/lib/orpc";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

import { DotsThree } from "@phosphor-icons/react/dist/ssr/DotsThree";
import { Folder } from "@phosphor-icons/react/dist/ssr/Folder";
import { FolderOpen } from "@phosphor-icons/react/dist/ssr/FolderOpen";
import { List } from "@phosphor-icons/react/dist/ssr/List";
import { PencilSimple } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";

import { DeleteFolderDialog } from "./delete-folder-dialog";
import { RenameFolderDialog } from "./rename-folder-dialog";

interface FolderSidebarProps {
    folders: string[];
    activeFolder: string | null;
    onSelectFolder: (folder: string | null) => void;
    counts: Record<string, number>;
}

export function FolderSidebar({
    folders,
    activeFolder,
    onSelectFolder,
    counts,
}: FolderSidebarProps) {
    const { id } = useParams();
    const websiteId = id as string;
    const queryClient = useQueryClient();

    const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
    const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    const renameMutation = useMutation({
        ...orpc.flags.renameFolder.mutationOptions(),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: orpc.flags.list.key({ input: { websiteId } }),
            });
            toast.success("Folder renamed successfully");
            setRenamingFolder(null);
            // If the renamed folder was active, deselect or select new name?
            // Usually fine to deselect or let user re-navigate
            if (activeFolder === renamingFolder) {
                onSelectFolder(null); // Fallback to all
            }
        },
        onError: () => {
            toast.error("Failed to rename folder");
        },
    });

    const deleteMutation = useMutation({
        ...orpc.flags.deleteFolder.mutationOptions(),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: orpc.flags.list.key({ input: { websiteId } }),
            });
            toast.success("Folder deleted successfully");
            setDeletingFolder(null);
            if (activeFolder === deletingFolder) {
                onSelectFolder(null);
            }
        },
        onError: () => {
            toast.error("Failed to delete folder");
        },
    });

    const handleSelect = (folder: string | null) => {
        onSelectFolder(folder);
        setIsMobileOpen(false);
    };

    const FolderList = () => (
        <div className="space-y-1">
            <button
                type="button"
                onClick={() => handleSelect(null)}
                className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md transition-colors",
                    activeFolder === null
                        ? "bg-secondary text-secondary-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
            >
                <div className="flex items-center gap-2">
                    <Folder
                        size={16}
                        weight={activeFolder === null ? "fill" : "regular"}
                    />
                    <span>All Flags</span>
                </div>
                <span className="text-xs opacity-70">{counts["all"] || 0}</span>
            </button>

            {folders.map((folder) => (
                <div key={folder} className="group relative flex items-center">
                    <button
                        type="button"
                        onClick={() => handleSelect(folder)}
                        className={cn(
                            "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md transition-colors pr-8", // pr-8 for menu button space
                            activeFolder === folder
                                ? "bg-secondary text-secondary-foreground font-medium"
                                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                        )}
                    >
                        <div className="flex items-center gap-2 truncate">
                            {activeFolder === folder ? (
                                <FolderOpen size={16} weight="fill" />
                            ) : (
                                <Folder size={16} />
                            )}
                            <span className="truncate">{folder}</span>
                        </div>
                        <span className="text-xs opacity-70">{counts[folder] || 0}</span>
                    </button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    "absolute right-1 p-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/80 focus:opacity-100",
                                    activeFolder === folder && "opacity-100"
                                )}
                            >
                                <DotsThree size={16} weight="bold" />
                                <span className="sr-only">Folder options</span>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => setRenamingFolder(folder)}>
                                <PencilSimple className="mr-2 size-4" />
                                Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setDeletingFolder(folder)}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash className="mr-2 size-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ))}
        </div>
    );

    return (
        <>
            {/* Desktop Sidebar */}
            <div className="hidden w-64 flex-shrink-0 border-r border-border pr-2 mr-2 space-y-1 md:block">
                <div className="mb-4 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Folders
                </div>
                <FolderList />
            </div>

            {/* Mobile Sidebar (Sheet) */}
            <div className="mb-4 md:hidden">
                <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-start">
                            <List size={16} className="mr-2" />
                            {activeFolder ? activeFolder : "All Folders"}
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-72">
                        <SheetHeader className="mb-4">
                            <SheetTitle>Folders</SheetTitle>
                        </SheetHeader>
                        <FolderList />
                    </SheetContent>
                </Sheet>
            </div>

            {/* Dialogs */}
            {renamingFolder && (
                <RenameFolderDialog
                    isOpen={!!renamingFolder}
                    onClose={() => setRenamingFolder(null)}
                    currentName={renamingFolder}
                    onConfirm={(newName) => {
                        renameMutation.mutate({
                            websiteId,
                            oldName: renamingFolder,
                            newName,
                        });
                    }}
                    isSubmitting={renameMutation.isPending}
                />
            )}

            {deletingFolder && (
                <DeleteFolderDialog
                    isOpen={!!deletingFolder}
                    onClose={() => setDeletingFolder(null)}
                    folderName={deletingFolder}
                    onConfirm={() => {
                        deleteMutation.mutate({
                            websiteId,
                            folder: deletingFolder,
                        });
                    }}
                    isDeleting={deleteMutation.isPending}
                />
            )}
        </>
    );
}
