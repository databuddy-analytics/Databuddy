"use client";

import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { Folder } from "@phosphor-icons/react/dist/ssr/Folder";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface FolderListItemProps {
    name: string;
    count: number;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

export function FolderListItem({
    name,
    count,
    children,
    defaultOpen = true,
}: FolderListItemProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border border-border rounded-lg overflow-hidden mb-4">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    {isOpen ? (
                        <CaretDown size={14} className="text-muted-foreground" />
                    ) : (
                        <CaretRight size={14} className="text-muted-foreground" />
                    )}
                    <Folder size={18} className="text-muted-foreground" />
                    <span className="font-medium text-sm">{name}</span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                        {count}
                    </span>
                </div>
            </button>

            <div
                className={cn(
                    "border-t border-border transition-all duration-200",
                    isOpen ? "block" : "hidden"
                )}
            >
                <div className="p-0">
                    {children}
                </div>
            </div>
        </div>
    );
}
