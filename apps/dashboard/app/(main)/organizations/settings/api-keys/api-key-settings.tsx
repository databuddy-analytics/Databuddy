"use client";

import { KeyIcon, PlusIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ApiKeyCreateDialog } from "@/components/organizations/api-key-create-dialog";
import { ApiKeyDetailDialog } from "@/components/organizations/api-key-detail-dialog";
import { RightSidebar } from "@/components/right-sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Organization } from "@/hooks/use-organizations";
import { orpc } from "@/lib/orpc";
import { ApiKeyRow, type ApiKeyRowItem } from "./api-key-row";

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

export function ApiKeySettings({ organization }: ApiKeySettingsProps) {
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [showDetailDialog, setShowDetailDialog] = useState(false);
	const [selectedKey, setSelectedKey] = useState<ApiKeyRowItem | null>(null);

	const { data, isLoading, isError } = useQuery({
		...orpc.apikeys.list.queryOptions({
			input: { organizationId: organization.id },
		}),
		refetchOnMount: true,
		refetchOnReconnect: true,
		staleTime: 0,
	});

	const items = (data ?? []) as ApiKeyRowItem[];
	const activeCount = items.filter((k) => k.enabled && !k.revokedAt).length;
	const isEmpty = items.length === 0;

	if (isLoading) {
		return <ApiKeysSkeleton />;
	}
	if (isError) {
		return (
			<EmptyState
				description="Please try again in a moment"
				icon={<KeyIcon weight="duotone" />}
				title="Failed to load API keys"
				variant="error"
			/>
		);
	}

	return (
		<>
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				{/* Keys List / Empty State */}
				<div className="flex flex-col border-b lg:border-b-0">
					{isEmpty ? (
						<EmptyState
							description="Create your first API key to start integrating with our platform"
							icon={<KeyIcon weight="duotone" />}
							title="No API keys yet"
						/>
					) : (
						<div className="flex-1 divide-y overflow-y-auto">
							{items.map((apiKey) => (
								<ApiKeyRow
									apiKey={apiKey}
									key={apiKey.id}
									onSelect={() => {
										setSelectedKey(apiKey);
										setShowDetailDialog(true);
									}}
								/>
							))}
						</div>
					)}
				</div>

				{/* Sidebar */}
				<RightSidebar className="gap-4 p-5">
					<Button className="w-full" onClick={() => setShowCreateDialog(true)}>
						<PlusIcon size={16} />
						Create New Key
					</Button>
					{!isEmpty && (
						<RightSidebar.InfoCard
							description="Active keys"
							icon={ShieldCheckIcon}
							title={`${activeCount} / ${items.length}`}
						/>
					)}
					<RightSidebar.DocsLink />
					<RightSidebar.Tip
						description="Keep your API keys secure. Never share them publicly or commit them to version control."
						title="Security reminder"
					/>
				</RightSidebar>
			</div>

			<ApiKeyCreateDialog
				onOpenChange={setShowCreateDialog}
				open={showCreateDialog}
				organizationId={organization.id}
			/>
			<ApiKeyDetailDialog
				apiKey={selectedKey}
				onOpenChangeAction={setShowDetailDialog}
				open={showDetailDialog}
			/>
		</>
	);
}
