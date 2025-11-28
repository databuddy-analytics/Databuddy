"use client";

import {
	ArrowClockwiseIcon,
	BookOpenIcon,
	KeyIcon,
	PlusIcon,
	ShieldCheckIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiKeyCreateDialog } from "@/components/organizations/api-key-create-dialog";
import { ApiKeyDetailDialog } from "@/components/organizations/api-key-detail-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Organization } from "@/hooks/use-organizations";
import { orpc } from "@/lib/orpc";
import { ApiKeyRow } from "./api-key-row";

type ApiKeySettingsProps = {
	organization: Organization;
};

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="h-10 w-10 rounded" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-48" />
			</div>
			<Skeleton className="h-6 w-16 rounded-full" />
			<Skeleton className="h-4 w-4" />
		</div>
	);
}

function ApiKeysSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="divide-y border-b lg:border-r lg:border-b-0">
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
				<KeyIcon className="text-primary" size={28} weight="duotone" />
			</div>
			<h3 className="mb-1 font-semibold text-lg">No API keys yet</h3>
			<p className="max-w-sm text-muted-foreground text-sm">
				Create your first API key to start integrating with our platform
			</p>
		</div>
	);
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex h-full flex-col items-center justify-center p-8 text-center">
			<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
				<KeyIcon className="text-destructive" size={28} weight="duotone" />
			</div>
			<h3 className="mb-1 font-semibold text-lg">Failed to load</h3>
			<p className="mb-6 max-w-sm text-muted-foreground text-sm">
				Something went wrong while loading your API keys
			</p>
			<Button onClick={onRetry} variant="outline">
				<ArrowClockwiseIcon className="mr-2" size={16} />
				Try again
			</Button>
		</div>
	);
}

export function ApiKeySettings({ organization }: ApiKeySettingsProps) {
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [showDetailDialog, setShowDetailDialog] = useState(false);
	const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

	const { data, isLoading, isError, refetch } = useQuery({
		...orpc.apikeys.list.queryOptions({
			input: { organizationId: organization.id },
		}),
		refetchOnMount: true,
		refetchOnReconnect: true,
		staleTime: 0,
	});

	const items = data ?? [];
	const activeCount = items.filter((k) => k.enabled && !k.revokedAt).length;
	const isEmpty = items.length === 0;

	if (isLoading) {
		return <ApiKeysSkeleton />;
	}
	if (isError) {
		return <ErrorState onRetry={refetch} />;
	}

	return (
		<>
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				{/* Keys List / Empty State */}
				<div className="flex flex-col border-b lg:border-r lg:border-b-0">
					{isEmpty ? (
						<EmptyState />
					) : (
						<div className="flex-1 divide-y overflow-y-auto">
							{items.map((apiKey) => (
								<ApiKeyRow
									apiKey={apiKey}
									key={apiKey.id}
									onSelect={(id) => {
										setSelectedKeyId(id);
										setShowDetailDialog(true);
									}}
								/>
							))}
						</div>
					)}
				</div>

				{/* Sidebar */}
				<aside className="flex flex-col gap-4 bg-muted/30 p-5">
					{/* Create Button */}
					<Button className="w-full" onClick={() => setShowCreateDialog(true)}>
						<PlusIcon className="mr-2" size={16} />
						Create New Key
					</Button>

					{/* Stats Card */}
					{!isEmpty && (
						<div className="flex items-center gap-3 rounded border bg-background p-4">
							<div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
								<ShieldCheckIcon
									className="text-primary"
									size={20}
									weight="duotone"
								/>
							</div>
							<div>
								<p className="font-semibold tabular-nums">
									{activeCount}{" "}
									<span className="font-normal text-muted-foreground">
										/ {items.length}
									</span>
								</p>
								<p className="text-muted-foreground text-sm">Active keys</p>
							</div>
						</div>
					)}

					{/* Actions */}
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

					{/* Tips */}
					<div className="mt-auto rounded border border-dashed bg-background/50 p-4">
						<p className="mb-2 font-medium text-sm">Security reminder</p>
						<p className="text-muted-foreground text-xs leading-relaxed">
							Keep your API keys secure. Never share them publicly or commit
							them to version control.
						</p>
					</div>
				</aside>
			</div>

			<ApiKeyCreateDialog
				onOpenChange={setShowCreateDialog}
				open={showCreateDialog}
				organizationId={organization.id}
			/>
			<ApiKeyDetailDialog
				keyId={selectedKeyId}
				onOpenChangeAction={setShowDetailDialog}
				open={showDetailDialog}
			/>
		</>
	);
}
