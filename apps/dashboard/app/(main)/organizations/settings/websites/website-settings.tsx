"use client";

import {
	ArrowClockwiseIcon,
	BookOpenIcon,
	CaretRightIcon,
	GlobeIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Organization } from "@/hooks/use-organizations";
import { orpc } from "@/lib/orpc";
import type { Website } from "@/hooks/use-websites";
interface WebsiteSettingsProps {
	organization: Organization;
}

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="h-10 w-10 rounded" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-48" />
			</div>
			<Skeleton className="h-4 w-4" />
		</div>
	);
}

function WebsitesSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="divide-y border-b lg:border-b-0 lg:border-r">
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
			<div className="space-y-4 bg-muted/30 p-5">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
			</div>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex h-full flex-col items-center justify-center p-8 text-center">
			<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
				<GlobeIcon className="text-primary" size={28} weight="duotone" />
			</div>
			<h3 className="mb-1 font-semibold text-lg">No websites yet</h3>
			<p className="mb-6 max-w-sm text-muted-foreground text-sm">
				Add your first website to start tracking analytics and performance
			</p>
			<Button asChild>
				<Link href="/websites">
					<PlusIcon className="mr-2" size={16} />
					Add Website
				</Link>
			</Button>
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
			className="group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
			href={`/websites/${website.id}`}
		>
			<FaviconImage
				altText={`${website.name} favicon`}
				className="h-10 w-10 transition-colors"
				domain={website.domain}
				fallbackIcon={
					<div className="flex h-10 w-10 items-center justify-center rounded border bg-background transition-colors group-hover:border-primary/30 group-hover:bg-primary/5">
						<GlobeIcon
							className="text-muted-foreground transition-colors group-hover:text-primary"
							size={18}
							weight="duotone"
						/>
					</div>
				}
				size={40}
			/>
			<div className="min-w-0">
				<p className="truncate font-medium">{website.name}</p>
				<p className="truncate text-muted-foreground text-sm">{website.domain}</p>
			</div>
			<CaretRightIcon
				className="text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
				size={16}
				weight="bold"
			/>
		</Link>
	);
}

export function WebsiteSettings({ organization }: WebsiteSettingsProps) {
	const { data, isLoading, isError, refetch } = useQuery({
		...orpc.websites.list.queryOptions({
			input: { organizationId: organization.id },
		}),
		refetchOnMount: true,
		staleTime: 0,
	});

	const websites = data ?? [];

	if (isLoading) return <WebsitesSkeleton />;
	if (isError) return <ErrorState onRetry={refetch} />;
	if (websites.length === 0) return <EmptyState />;

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			{/* Websites List */}
			<div className="flex flex-col border-b lg:border-b-0 lg:border-r">
				<div className="flex-1 divide-y overflow-y-auto">
					{websites.map((website) => (
						<WebsiteRow key={website.id} website={website} />
					))}
				</div>
			</div>

			{/* Sidebar */}
			<aside className="flex flex-col gap-4 bg-muted/30 p-5">
				{/* Add Website Button */}
				<Button asChild className="w-full">
					<Link href="/websites">
						<PlusIcon className="mr-2" size={16} />
						Add New Website
					</Link>
				</Button>

				{/* Stats Card */}
				<div className="flex items-center gap-3 rounded border bg-background p-4">
					<div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
						<GlobeIcon className="text-primary" size={20} weight="duotone" />
					</div>
					<div>
						<p className="font-semibold tabular-nums">{websites.length}</p>
						<p className="text-muted-foreground text-sm">
							Website{websites.length !== 1 ? "s" : ""}
						</p>
					</div>
				</div>

				{/* Docs Link */}
				<Button asChild className="w-full justify-start" variant="outline">
					<a
						href="https://www.databuddy.cc/docs/getting-started"
						rel="noopener noreferrer"
						target="_blank"
					>
						<BookOpenIcon className="mr-2" size={16} />
						Documentation
					</a>
				</Button>

				{/* Tip */}
				<div className="mt-auto rounded border border-dashed bg-background/50 p-4">
					<p className="mb-2 font-medium text-sm">Quick tip</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						Click on a website to view its settings, manage tracking scripts, and
						configure analytics.
					</p>
				</div>
			</aside>
		</div>
	);
}
