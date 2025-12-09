import { KeyIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import type { ApiKeyRowItem } from "@/app/(main)/organizations/settings/api-keys/api-key-row";
import { orpc } from "@/lib/orpc";
import { EmptyState } from "../empty-state";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../ui/table";
import type { ApiKeyListItem } from "./api-key-types";

type ApiKeyListProps = {
	organizationId?: string;
	onCreateNew?: () => void;
	onSelect?: (apiKey: ApiKeyListItem) => void;
};

function ApiKeyListSkeleton() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Skeleton className="h-7 w-24 rounded" />
				<Skeleton className="h-10 w-28 rounded" />
			</div>
			<div className="overflow-hidden rounded border border-border/50 bg-card">
				<div className="border-border/50 border-b bg-muted/10 px-6 py-4">
					<div className="flex gap-4">
						<Skeleton className="h-4 w-16 rounded" />
						<Skeleton className="h-4 w-12 rounded" />
						<Skeleton className="h-4 w-14 rounded" />
						<Skeleton className="h-4 w-16 rounded" />
						<Skeleton className="h-4 w-20 rounded" />
						<Skeleton className="h-4 w-20 rounded" />
					</div>
				</div>
				{["row-a", "row-b", "row-c"].map((key) => (
					<div
						className="border-border/30 border-b px-6 py-4 last:border-b-0"
						key={key}
					>
						<div className="flex items-center gap-4">
							<Skeleton className="h-4 w-32 rounded" />
							<Skeleton className="h-4 w-20 rounded" />
							<Skeleton className="h-4 w-12 rounded" />
							<Skeleton className="h-5 w-16 rounded" />
							<Skeleton className="h-4 w-24 rounded" />
							<Skeleton className="h-4 w-24 rounded" />
							<Skeleton className="ml-auto h-8 w-16 rounded" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function ApiKeyList({
	organizationId,
	onCreateNew,
	onSelect,
}: ApiKeyListProps) {
	const { data, isLoading, isError } = useQuery({
		...orpc.apikeys.list.queryOptions({ input: { organizationId } }),
		refetchOnMount: true,
		refetchOnReconnect: true,
		staleTime: 0,
	});

	if (isLoading) {
		return <ApiKeyListSkeleton />;
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

	const items = (data ?? []) as ApiKeyRowItem[];

	return (
		<div className="h-full space-y-6">
			{/* Table Container */}
			{items.length > 0 && (
				<div className="overflow-hidden rounded border">
					{/* Table Header with Create Button */}
					<div className="flex items-center justify-between border-b bg-accent px-3 py-2">
						<div>
							<h1 className="font-medium text-base">API Keys</h1>
							<p className="text-muted-foreground text-xs">
								{items.length} active key{items.length !== 1 ? "s" : ""}
							</p>
						</div>
						<Button onClick={onCreateNew} size="sm" type="button">
							<PlusIcon className="size-3" />
							Create
						</Button>
					</div>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead>Name</TableHead>
									<TableHead>Prefix</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Created</TableHead>
									<TableHead>Updated</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((k) => (
									<TableRow
										className="group cursor-pointer"
										key={k.id}
										onClick={() => onSelect?.(k)}
									>
										<TableCell>
											<div className="flex items-center gap-3">
												<div className="font-medium">{k.name}</div>
											</div>
										</TableCell>
										<TableCell className="p-3">
											<code className="rounded bg-accent-brighter px-2 py-1 font-mono text-accent-foreground text-xs hover:bg-accent-brighter/70">
												{k.prefix}-{k.start}
											</code>
										</TableCell>
										<TableCell className="p-3">
											{k.enabled && !k.revokedAt ? (
												<Badge variant="gray">
													<div className="mr-1 h-1.5 w-1.5 rounded-full bg-green-500" />
													Active
												</Badge>
											) : (
												<Badge
													className="bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800/50 dark:text-gray-400"
													variant="secondary"
												>
													<div className="mr-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
													Inactive
												</Badge>
											)}
										</TableCell>
										<TableCell className="p-3 text-muted-foreground text-xs">
											{dayjs(k.createdAt).format("MMM D, YYYY")}
										</TableCell>
										<TableCell className="p-3 text-muted-foreground text-xs">
											{dayjs(k.updatedAt).format("MMM D, YYYY")}
										</TableCell>
										<TableCell className="p-3 text-right">
											<Button
												onClick={(e) => {
													e.stopPropagation();
													onSelect?.(k);
												}}
												size="sm"
												type="button"
												variant="secondary"
											>
												Manage
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</div>
			)}

			{/* Empty State */}
			{items.length === 0 && (
				<EmptyState
					action={{
						label: "Create Your First API Key",
						onClick: () => onCreateNew?.(),
					}}
					description="Create your first API key to start integrating with our platform."
					icon={<KeyIcon weight="duotone" />}
					title="No API keys yet"
					variant="minimal"
				/>
			)}
		</div>
	);
}
