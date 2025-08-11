import { KeyIcon, PlusIcon } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { trpc } from '@/lib/trpc';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '../ui/table';
import type { ApiKeyListItem } from './api-key-types';

interface ApiKeyListProps {
	organizationId?: string;
	onCreateNew?: () => void;
	onSelect?: (id: string) => void;
}

function ApiKeyListSkeleton() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Skeleton className="h-7 w-24 rounded" />
				<Skeleton className="h-10 w-28 rounded" />
			</div>
			<div className="overflow-hidden rounded border border-border/50 bg-card">
				<div className="border-border/50 border-b bg-muted/30 px-6 py-4">
					<div className="flex gap-4">
						<Skeleton className="h-4 w-16 rounded" />
						<Skeleton className="h-4 w-12 rounded" />
						<Skeleton className="h-4 w-14 rounded" />
						<Skeleton className="h-4 w-16 rounded" />
						<Skeleton className="h-4 w-20 rounded" />
						<Skeleton className="h-4 w-20 rounded" />
					</div>
				</div>
				{['row-a', 'row-b', 'row-c'].map((key) => (
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
	const { data, isLoading, isError } = trpc.apikeys.list.useQuery(
		{
			organizationId,
		},
		{
			// ensure a refetch when the component mounts/changes organization
			refetchOnMount: true,
			refetchOnReconnect: true,
			staleTime: 0,
		}
	);

	if (isLoading) {
		return <ApiKeyListSkeleton />;
	}

	if (isError) {
		return (
			<div className="rounded border p-6 text-center">
				<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
					<KeyIcon className="h-6 w-6 not-dark:text-primary" weight="duotone" />
				</div>
				<div className="font-semibold text-foreground text-sm">
					Failed to load API keys
				</div>
				<div className="mt-1 text-muted-foreground text-xs">
					Please try again in a moment
				</div>
			</div>
		);
	}

	const items = (data ?? []) as ApiKeyListItem[];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="rounded border p-2">
						<KeyIcon
							className="h-5 w-5 not-dark:text-primary"
							weight="duotone"
						/>
					</div>
					<div>
						<h3 className="font-semibold text-foreground text-lg">API Keys</h3>
						<p className="text-muted-foreground text-sm">
							Manage your API access keys and permissions
						</p>
					</div>
				</div>
				<Button onClick={onCreateNew} type="button">
					<PlusIcon className="mr-2 h-4 w-4" />
					Create Key
				</Button>
			</div>

			{/* Table Container */}
			<div className="overflow-hidden rounded border">
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
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
									className="cursor-pointer hover:bg-muted/50"
									key={k.id}
									onClick={() => onSelect?.(k.id)}
								>
									<TableCell>
										<div className="flex items-center gap-3">
											<div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
												<KeyIcon
													className="h-4 w-4 not-dark:text-primary"
													weight="duotone"
												/>
											</div>
											<div className="font-medium">{k.name}</div>
										</div>
									</TableCell>
									<TableCell className="px-6 py-4">
										<code className="rounded bg-muted/50 px-2 py-1 font-mono text-muted-foreground text-xs transition-colors group-hover:bg-muted/70">
											{k.prefix}_{k.start}
										</code>
									</TableCell>
									<TableCell className="px-6 py-4">
										{k.enabled && !k.revokedAt ? (
											<Badge
												className="bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
												variant="default"
											>
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
									<TableCell className="px-6 py-4 text-muted-foreground text-xs">
										{dayjs(k.createdAt).format('MMM D, YYYY')}
									</TableCell>
									<TableCell className="px-6 py-4 text-muted-foreground text-xs">
										{dayjs(k.updatedAt).format('MMM D, YYYY')}
									</TableCell>
									<TableCell className="px-6 py-4 text-right">
										<Button
											className="rounded opacity-0 transition-all duration-200 hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
											onClick={(e) => {
												e.stopPropagation();
												onSelect?.(k.id);
											}}
											size="sm"
											type="button"
											variant="ghost"
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

			{/* Empty State */}
			{items.length === 0 && (
				<div className="rounded border border-dashed p-8 text-center">
					<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
						<KeyIcon
							className="h-6 w-6 not-dark:text-primary text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="mb-2 font-semibold text-foreground">
						No API keys yet
					</div>
					<div className="mx-auto mb-4 max-w-sm text-muted-foreground text-sm">
						Create your first API key to start integrating with our platform.
					</div>
					<Button onClick={onCreateNew} type="button">
						<PlusIcon className="mr-2 h-4 w-4 not-dark:text-primary" />
						Create Your First Key
					</Button>
				</div>
			)}
		</div>
	);
}
