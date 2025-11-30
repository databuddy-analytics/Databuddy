import {InfoIcon} from "@phosphor-icons/react";
import React from "react";

interface TipProps {
    title?: string;
    description: string;
}

    export function Tip({
    title = "Quick tip",
    description,
}: TipProps) {
    return (
        	<div className="mt-auto rounded border border-dashed bg-background/50 p-4">
					<div className="mb-2 flex items-center gap-1">
						<InfoIcon size={14} weight="duotone" />
						<p className="font-medium text-sm">{title}</p>
					</div>
					<p className="text-muted-foreground text-xs leading-relaxed">
						{description}
					</p>
				</div>
    )
}