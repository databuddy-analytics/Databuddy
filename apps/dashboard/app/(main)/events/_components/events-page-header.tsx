"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { LightningIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventsPageContext } from "./events-page-context";

function getDropdownLabel(
	websiteFilterMode: string,
	selectedWebsite: { name: string; domain: string } | undefined
) {
	if (websiteFilterMode === "no-website") {
		return "No Website";
	}
	if (websiteFilterMode === "all") {
		return "All Websites";
	}
	if (selectedWebsite) {
		return selectedWebsite.name || selectedWebsite.domain;
	}
	return "Unknown";
}

export function EventsPageHeader() {
	const {
		websiteFilterMode,
		setWebsiteFilterMode,
		selectedWebsite,
		websites,
		isLoadingWebsites,
		hasQueryId,
		query,
	} = useEventsPageContext();

	return (
		<PageHeader
			badgeContent="Alpha"
			badgeVariant="amber"
			description="Track and analyze custom events across all websites"
			icon={<LightningIcon weight="duotone" />}
			right={
				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								className="min-w-[140px] justify-between"
								disabled={isLoadingWebsites}
								variant="outline"
							>
								{isLoadingWebsites ? (
									<Skeleton className="h-4 w-20" />
								) : (
									<span className="truncate">
										{getDropdownLabel(websiteFilterMode, selectedWebsite)}
									</span>
								)}
								<CaretDownIcon className="ml-2 size-4" weight="fill" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-[200px]">
							<DropdownMenuItem onClick={() => setWebsiteFilterMode("all")}>
								All Websites
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setWebsiteFilterMode("no-website")}
							>
								No Website
							</DropdownMenuItem>
							{websites.length > 0 && <DropdownMenuSeparator />}
							{websites.map((website) => (
								<DropdownMenuItem
									key={website.id}
									onClick={() => setWebsiteFilterMode(website.id)}
								>
									{website.name || website.domain}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					<Button
						aria-label="Refresh events data"
						disabled={query.isFetching || !hasQueryId}
						onClick={() => query.refetch()}
						size="icon"
						variant="outline"
					>
						<ArrowClockwiseIcon
							className={query.isFetching ? "animate-spin" : ""}
							size={16}
						/>
					</Button>
				</div>
			}
			title="Custom Events"
		/>
	);
}
