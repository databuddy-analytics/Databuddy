"use client";

import { TopBar } from "@/components/layout/top-bar";
import { cn } from "@/lib/utils";
import { useEventsPageContext } from "./events-page-context";
import { ArrowClockwiseIcon, CaretDownIcon } from "@databuddy/ui/icons";
import { DropdownMenu } from "@databuddy/ui/client";
import { Badge, Button, Skeleton } from "@databuddy/ui";

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
		<>
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Custom Events</h1>
				<Badge className="h-5 px-2" variant="warning">
					Alpha
				</Badge>
			</TopBar.Title>
			<TopBar.Actions>
				<DropdownMenu>
					<DropdownMenu.Trigger
						className={cn(
							"inline-flex items-center justify-center gap-1.5 rounded-md font-medium",
							"transition-all duration-(--duration-quick) ease-(--ease-smooth)",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
							"disabled:pointer-events-none disabled:opacity-50",
							"h-8 px-3 text-xs",
							"bg-secondary text-foreground hover:bg-interactive-hover",
							"min-w-[140px] justify-between"
						)}
						disabled={isLoadingWebsites}
					>
						{isLoadingWebsites ? (
							<Skeleton className="h-4 w-20" />
						) : (
							<span className="truncate">
								{getDropdownLabel(websiteFilterMode, selectedWebsite)}
							</span>
						)}
						<CaretDownIcon className="ml-2 size-4 shrink-0" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" className="w-[200px]">
						<DropdownMenu.Item onClick={() => setWebsiteFilterMode("all")}>
							All Websites
						</DropdownMenu.Item>
						<DropdownMenu.Item
							onClick={() => setWebsiteFilterMode("no-website")}
						>
							No Website
						</DropdownMenu.Item>
						{websites.length > 0 && <DropdownMenu.Separator />}
						{websites.map((website) => (
							<DropdownMenu.Item
								key={website.id}
								onClick={() => setWebsiteFilterMode(website.id)}
							>
								{website.name || website.domain}
							</DropdownMenu.Item>
						))}
					</DropdownMenu.Content>
				</DropdownMenu>
				<Button
					aria-label="Refresh events data"
					disabled={query.isFetching || !hasQueryId}
					onClick={() => query.refetch()}
					size="sm"
					variant="secondary"
				>
					<ArrowClockwiseIcon
						className={cn(
							"size-4 shrink-0",
							query.isFetching && "animate-spin"
						)}
					/>
				</Button>
			</TopBar.Actions>
		</>
	);
}
