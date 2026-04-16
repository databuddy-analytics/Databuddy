"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import { GlobeIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WebsiteDialog } from "@/components/website-dialog";
import type { Organization } from "@/hooks/use-organizations";
import { orpc } from "@/lib/orpc";

interface WebsiteRowData {
	domain: string;
	id: string;
	name: string | null;
}

function WebsiteRow({ website }: { website: WebsiteRowData }) {
	return (
		<Link
			className="group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-muted/50"
			href={`/websites/${website.id}`}
		>
			<FaviconImage
				altText={`${website.name} favicon`}
				className="size-8"
				domain={website.domain}
				fallbackIcon={
					<div className="flex size-8 items-center justify-center rounded border bg-background">
						<GlobeIcon
							className="text-muted-foreground"
							size={16}
							weight="duotone"
						/>
					</div>
				}
				size={32}
			/>
			<div className="min-w-0">
				<p className="truncate font-medium text-sm">{website.name}</p>
				<p className="truncate text-muted-foreground text-xs">
					{website.domain}
				</p>
			</div>
			<CaretRightIcon
				className="text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-foreground"
				size={14}
				weight="bold"
			/>
		</Link>
	);
}

function WebsitesSkeleton() {
	return (
		<div className="divide-y">
			{[1, 2, 3].map((num) => (
				<div
					className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3"
					key={`websites-skeleton-${num}`}
				>
					<Skeleton className="size-8 rounded" />
					<div className="space-y-1.5">
						<Skeleton className="h-3.5 w-32" />
						<Skeleton className="h-3 w-48" />
					</div>
					<Skeleton className="size-4" />
				</div>
			))}
		</div>
	);
}

export function WorkspaceWebsitesSection({
	organization,
}: {
	organization: Organization;
}) {
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	const { data, isLoading, refetch } = useQuery({
		...orpc.websites.list.queryOptions({
			input: { organizationId: organization.id },
		}),
		refetchOnMount: true,
		staleTime: 0,
	});

	const websites = data ?? [];

	return (
		<section className="border-b px-5 py-6">
			<div className="mb-4 flex items-start justify-between gap-4">
				<div>
					<h3 className="font-semibold text-sm">Websites in this workspace</h3>
					<p className="text-muted-foreground text-xs">
						{websites.length === 0
							? "Add your first website to start tracking analytics"
							: `${websites.length} website${websites.length === 1 ? "" : "s"} tracked by this workspace`}
					</p>
				</div>
				<Button
					onClick={() => setShowCreateDialog(true)}
					size="sm"
					variant="outline"
				>
					<PlusIcon size={14} />
					New Website
				</Button>
			</div>

			{isLoading ? (
				<WebsitesSkeleton />
			) : websites.length === 0 ? (
				<div className="rounded border border-dashed px-4 py-8 text-center">
					<GlobeIcon
						className="mx-auto mb-2 text-muted-foreground/60"
						size={24}
						weight="duotone"
					/>
					<p className="text-muted-foreground text-sm">No websites yet</p>
				</div>
			) : (
				<div className="divide-y rounded border">
					{websites.map((website) => (
						<WebsiteRow key={website.id} website={website} />
					))}
				</div>
			)}

			<WebsiteDialog
				onOpenChange={setShowCreateDialog}
				onSave={() => {
					refetch();
				}}
				open={showCreateDialog}
			/>
		</section>
	);
}
