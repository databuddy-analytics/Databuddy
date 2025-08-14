'use client';

import type { Website } from '@databuddy/shared';
import { GlobeIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

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
				'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all duration-200',
				selected
					? 'border-primary/30 bg-primary/10 shadow-sm ring-2 ring-primary/20'
					: 'border-border/50 bg-background/50 hover:border-border/70 hover:bg-muted/80'
			)}
			onClick={onClick}
			type="button"
		>
			<div className="flex-shrink-0 rounded bg-primary/10 p-1.5">
				<GlobeIcon className="h-3.5 w-3.5 not-dark:text-primary" size={14} />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-foreground text-sm">
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
	onSelectWebsite,
}: {
	websites: Website[];
	selectedWebsite: string | null;
	onSelectWebsite: (id: string | null) => void;
}) {
	return (
		<div className="max-h-60 space-y-2 overflow-y-auto p-1">
			{websites.length > 0 ? (
				websites.map((website) => (
					<WebsiteCard
						key={website.id}
						onClick={() =>
							onSelectWebsite(
								website.id === selectedWebsite ? null : website.id
							)
						}
						selected={selectedWebsite === website.id}
						website={website}
					/>
				))
			) : (
				<div className="py-8 text-center">
					<GlobeIcon
						className="mx-auto mb-2 h-8 w-8 not-dark:text-primary"
						size={32}
						weight="duotone"
					/>
					<p className="text-muted-foreground text-sm">No websites found</p>
				</div>
			)}
		</div>
	);
}
