import type { Website } from "@databuddy/shared/types/website";
import { CaretLeftIcon, PlanetIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Skeleton } from "@/components/ui/skeleton";

type WebsiteHeaderProps = {
	website: Website | null | undefined;
	showBackButton?: boolean;
};

export function WebsiteHeader({
	website,
	showBackButton = true,
}: WebsiteHeaderProps) {
	const displayName = website?.name || website?.domain;

	return (
		<div className="bg-sidebar-accent">
			<div className="flex h-12 items-center gap-3 border-b px-3">
				<div className="rounded-lg bg-sidebar/80 p-1.5 shadow-sm ring-1 ring-sidebar-border/50">
					<FaviconImage
						altText={`${displayName || "Website"} favicon`}
						className="size-5"
						domain={website?.domain || ""}
						fallbackIcon={
							<PlanetIcon
								className="text-sidebar-ring"
								size={20}
								weight="duotone"
							/>
						}
						size={20}
					/>
				</div>
				<div className="min-w-0 flex-1 space-y-0.5">
					{displayName ? (
						<h2 className="truncate font-semibold text-sidebar-accent-foreground text-sm">
							{displayName}
						</h2>
					) : (
						<Skeleton className="h-4 w-32" />
					)}
					{website?.domain ? (
						<p className="truncate text-sidebar-accent-foreground/70 text-xs">
							{website.domain}
						</p>
					) : (
						<Skeleton className="h-3 w-24" />
					)}
				</div>
			</div>

			{showBackButton && (
				<Link
					className="group flex h-10 items-center gap-2 border-b px-3 hover:bg-accent"
					href="/websites"
				>
					<CaretLeftIcon
						className="group-hover:-translate-x-0.5 size-3 text-sidebar-accent-foreground/80 transition-transform group-hover:text-sidebar-accent-foreground"
						weight="fill"
					/>
					<span className="font-semibold text-sidebar-accent-foreground/80 text-xs group-hover:text-sidebar-accent-foreground">
						Back to Websites
					</span>
				</Link>
			)}
		</div>
	);
}
