"use client";

import { FaviconImage } from "@/components/analytics/favicon-image";
import type { Website } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import { Button } from "@databuddy/ui";
import { memo, useEffect, useRef } from "react";

interface AgentMentionMenuProps {
	anchor: React.ReactNode;
	onHover: (index: number) => void;
	onSelect: (website: Website) => void;
	open: boolean;
	selectedIndex: number;
	websites: Website[];
}

const MentionRow = memo(function MentionRow({
	index,
	isSelected,
	onHover,
	onSelect,
	website,
}: {
	index: number;
	isSelected: boolean;
	onHover: (index: number) => void;
	onSelect: (website: Website) => void;
	website: Website;
}) {
	const ref = useRef<HTMLLIElement | null>(null);

	useEffect(() => {
		if (isSelected) {
			ref.current?.scrollIntoView({ block: "nearest" });
		}
	}, [isSelected]);

	const domain = website.domain ?? "";

	return (
		<li ref={ref}>
			<Button
				className={cn(
					"h-auto w-full justify-start whitespace-normal rounded-none px-2 py-1.5 text-left",
					isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
				)}
				onClick={() => onSelect(website)}
				onMouseDown={(e) => e.preventDefault()}
				onMouseMove={() => onHover(index)}
				variant="ghost"
			>
				<span className="flex size-8 shrink-0 items-center justify-center rounded border bg-background">
					<FaviconImage domain={domain} size={16} />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate font-medium text-sm leading-tight">
						{website.name ?? domain}
					</span>
					<span className="block truncate text-foreground/50 text-xs leading-snug">
						{domain}
					</span>
				</span>
			</Button>
		</li>
	);
});

export function AgentMentionMenu({
	anchor,
	onHover,
	onSelect,
	open,
	selectedIndex,
	websites,
}: AgentMentionMenuProps) {
	return (
		<div className="relative">
			{anchor}
			{open ? (
				<div
					className={cn(
						"absolute right-0 bottom-full left-0 z-30 mb-2 overflow-hidden rounded border border-border/60 bg-popover shadow-lg",
						"fade-in slide-in-from-bottom-1 animate-in duration-150"
					)}
				>
					<div className="border-border/60 border-b bg-muted/40 px-3 py-1.5 font-medium text-[10px] text-muted-foreground uppercase">
						Mention a website
					</div>
					<ul className="max-h-72 overflow-y-auto py-1">
						{websites.map((website, idx) => (
							<MentionRow
								index={idx}
								isSelected={idx === selectedIndex}
								key={website.id}
								onHover={onHover}
								onSelect={onSelect}
								website={website}
							/>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}
