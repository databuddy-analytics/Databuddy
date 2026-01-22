import type { Website } from "@databuddy/shared/types/website";
import { ChevronLeftIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Skeleton } from "@/components/ui/skeleton";

interface WebsiteHeaderProps {
	website: Website | null | undefined;
	showBackButton?: boolean;
}

export function WebsiteHeader({
	website,
	showBackButton = true,
}: WebsiteHeaderProps) {
	const displayName = website?.name || website?.domain;

	return (
		<div className="border-b border-border">
			<div className="flex h-16 min-w-0 items-center gap-3 px-4">
				<div className="shrink-0">
					<FaviconImage
						altText={`${displayName || "Website"} favicon`}
						className="size-8 rounded-full"
						domain={website?.domain || ""}
						fallbackIcon={
							<GlobeAltIcon className="size-8 text-muted-foreground" />
						}
						size={32}
					/>
				</div>
				<div className="min-w-0 flex-1">
					{displayName ? (
						<h2 className="truncate font-medium text-foreground text-sm leading-none">
							{displayName}
						</h2>
					) : (
						<Skeleton className="h-4 w-32" />
					)}
					{website?.domain ? (
						<p className="mt-1 truncate text-muted-foreground text-xs leading-none">
							{website.domain}
						</p>
					) : (
						<Skeleton className="mt-1 h-3 w-24" />
					)}
				</div>
			</div>

			{showBackButton && (
				<Link
					className="group flex h-12 min-w-0 items-center gap-2 border-t border-border px-4 hover:bg-muted/50"
					href="/websites"
				>
					<ChevronLeftIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:text-foreground" />
					<span className="truncate font-medium text-muted-foreground text-sm group-hover:text-foreground">
						Back to Websites
					</span>
				</Link>
			)}
		</div>
	);
}
