"use client";

import type { Website } from "@databuddy/shared/types/website";
import { GlobeIcon } from "@phosphor-icons/react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { cn } from "@/lib/utils";

function WebsiteCard({
	website,
	selected,
	onClick,
}: {
	website: Website;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			className={cn(
				"flex w-full items-center gap-3 rounded border p-2 text-left transition-all duration-200",
				selected
					? "border-primary/30 bg-primary/10 shadow-sm ring-1 ring-primary/20"
					: "border-border/30 bg-background/50 hover:border-border/60 hover:bg-muted/60"
			)}
			onClick={onClick}
			type="button"
		>
			<FaviconImage
				altText={`${website.name} favicon`}
				className="shrink-0 rounded"
				domain={website.domain}
				fallbackIcon={
					<div className="rounded bg-primary/10 p-1">
						<GlobeIcon className="h-3 w-3 text-primary" size={12} />
					</div>
				}
				size={16}
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-foreground text-xs">
					{website.name}
				</p>
				<p className="truncate text-muted-foreground text-xs">
					{website.domain}
				</p>
			</div>
		</button>
	);
}

export function WebsiteSelector({
	websites,
	selectedWebsite,
	onSelectWebsiteAction,
}: {
	websites: Website[];
	selectedWebsite: string | null;
	onSelectWebsiteAction: (id: string | null) => void;
}) {
	return (
		<div className="max-h-48 space-y-1 overflow-y-auto p-1">
			{websites.length > 0 ? (
				websites.map((website) => (
					<WebsiteCard
						key={website.id}
						onClick={() =>
							onSelectWebsiteAction(
								website.id === selectedWebsite ? null : website.id
							)
						}
						selected={selectedWebsite === website.id}
						website={website}
					/>
				))
			) : (
				<div className="py-6 text-center">
					<GlobeIcon
						className="mx-auto mb-2 size-6 text-accent-foreground"
						size={24}
						weight="duotone"
					/>
					<p className="text-muted-foreground text-xs">No websites found</p>
				</div>
			)}
		</div>
	);
}
