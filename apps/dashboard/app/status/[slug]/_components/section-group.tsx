"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface SectionGroupProps {
	name: string;
	isCollapsed: boolean;
	children: React.ReactNode;
}

export function SectionGroup({
	name,
	isCollapsed,
	children,
}: SectionGroupProps) {
	const [collapsed, setCollapsed] = useState(isCollapsed);

	return (
		<div className="space-y-3">
			<button
				className="flex w-full items-center gap-2 text-left"
				onClick={() => setCollapsed((prev) => !prev)}
				type="button"
			>
				<CaretDownIcon
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform",
						collapsed && "-rotate-90"
					)}
					weight="fill"
				/>
				<h3 className="font-semibold text-sm">{name}</h3>
			</button>

			{collapsed ? null : <div className="space-y-3">{children}</div>}
		</div>
	);
}
