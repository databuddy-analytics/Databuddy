"use client";

import { DeleteDialog } from "@/components/ui/delete-dialog";

interface DeleteFolderDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    folderName: string;
    isDeleting?: boolean;
}

export function DeleteFolderDialog({
    isOpen,
    onClose,
    onConfirm,
    folderName,
    isDeleting = false,
}: DeleteFolderDialogProps) {
    return (
        <DeleteDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            title="Delete Folder"
            description={`Are you sure you want to delete the folder "${folderName}"?`}
            confirmLabel="Delete Folder"
            isDeleting={isDeleting}
            itemName={folderName}
        >
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                <p>
                    Flags in this folder will <strong>not</strong> be deleted. They will be moved to
                    "Uncategorized".
                </p>
            </div>
        </DeleteDialog>
    );
}
