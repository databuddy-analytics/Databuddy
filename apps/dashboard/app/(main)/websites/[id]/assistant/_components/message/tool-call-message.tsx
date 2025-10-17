"use client";

import { cn } from "@/lib/utils";
import { TextShimmer } from "@/components/text-shimmer";
import { toolMetadata } from "@databuddy/ai/tools/registry";

export type SupportedToolName = keyof typeof toolMetadata;

export interface ToolCallIndicatorProps {
    toolName: SupportedToolName;
    className?: string;
}

export function ToolCallIndicator({
    toolName,
    className,
}: ToolCallIndicatorProps) {
    const config = toolMetadata[toolName];

    if (!config) {
        return null;
    }

    return (
        <div className={cn("flex justify-start mt-3 animate-fade-in", className)}>
            <div className="border px-3 py-1 flex items-center gap-2 w-fit border-border rounded-md">
                <TextShimmer className="text-xs">
                    {config.title}
                </TextShimmer>
            </div>
        </div>
    );
}