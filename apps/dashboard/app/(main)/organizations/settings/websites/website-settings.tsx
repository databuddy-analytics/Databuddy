"use client";

import {
	ArrowClockwiseIcon,
	CaretRightIcon,
	GlobeIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { EmptyState } from "@/components/empty-state";
import { RightSidebar } from "@/components/right-sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WebsiteDialog } from "@/components/website-dialog";
import type { Organization } from "@/hooks/use-organizations";
import type { Website } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="h-10 w-10 rounded" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-48" />
			</div>
			<Skeleton className="size-4" />
		</div>
	);
}

function WebsitesSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="divide-y border-b lg:border-b-0">
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
			<div className="space-y-4 bg-card p-5">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
			</div>
		</div>
	);
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex h-full flex-col items-center justify-center p-8 text-center">
			<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
				<GlobeIcon className="text-destructive" size={28} weight="duotone" />
			</div>
			<h3 className="mb-1 font-semibold text-lg">Failed to load</h3>
			<p className="mb-6 max-w-sm text-muted-foreground text-sm">
				Something went wrong while loading your websites
			</p>
			<Button onClick={onRetry} variant="outline">
				<ArrowClockwiseIcon className="mr-2" size={16} />
				Try again
			</Button>
		</div>
	);
}

interface WebsiteRowProps {
	website: Website;
}

function WebsiteRow({ website }: WebsiteRowProps) {
	return (
		<Link
			className="group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4 hover:bg-muted/50"
			href={`/websites/${website.id}`}
		>
			<FaviconImage
				altText={`${website.name} favicon`}
				className="h-10 w-10"
				domain={website.domain}
				fallbackIcon={
					<div className="flex h-10 w-10 items-center justify-center rounded border bg-background group-hover:border-primary/30 group-hover:bg-primary/5">
						<GlobeIcon
							className="text-muted-foreground group-hover:text-primary"
							size={18}
							weight="duotone"
						/>
					</div>
				}
				size={40}
			/>
			<div className="min-w-0">
				<p className="truncate font-medium">{website.name}</p>
				<p className="truncate text-muted-foreground text-sm">
					{website.domain}
				</p>
			</div>
			<CaretRightIcon
				className="text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
				size={16}
				weight="bold"
			/>
		</Link>
	);
}

export function WebsiteSettings({
	organization,
}: {
	organization: Organization;
}) {
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	const { data, isLoading, isError, refetch } = useQuery({
		...orpc.websites.list.queryOptions({
			input: { organizationId: organization.id },
		}),
		refetchOnMount: true,
		staleTime: 0,
	});

	const websites = data ?? [];
	const isEmpty = websites.length === 0;

	if (isLoading) {
		return <WebsitesSkeleton />;
	}
	if (isError) {
		return <ErrorState onRetry={refetch} />;
	}

	return (
		<>
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				{/* Websites List / Empty State */}
				<div className="flex flex-col border-b lg:border-b-0">
					{isEmpty ? (
						<EmptyState
							description="Start tracking your website analytics by adding your first website. Get insights into visitors, pageviews, and performance."
							icon={<GlobeIcon weight="duotone" />}
							title="No websites yet"
							variant="minimal"
						/>
					) : (
						<div className="flex-1 divide-y overflow-y-auto">
							{websites.map((website) => (
								<WebsiteRow key={website.id} website={website} />
							))}
						</div>
					)}
				</div>

				{/* Sidebar */}
				<RightSidebar className="gap-4 p-5">
					<Button className="w-full" onClick={() => setShowCreateDialog(true)}>
						<PlusIcon className="mr-2" size={16} />
						Create New Website
					</Button>
					{!isEmpty && (
						<RightSidebar.InfoCard
							description={`Website${websites.length !== 1 ? "s" : ""}`}
							icon={GlobeIcon}
							title={String(websites.length)}
						/>
					)}
					<RightSidebar.DocsLink />
					<RightSidebar.Tip description="Click on a website to view its settings, manage tracking scripts, and configure analytics." />
				</RightSidebar>
			</div>

			<WebsiteDialog
				onOpenChange={setShowCreateDialog}
				onSave={() => {
					refetch();
				}}
				open={showCreateDialog}
			/>
		</>
	);
}
