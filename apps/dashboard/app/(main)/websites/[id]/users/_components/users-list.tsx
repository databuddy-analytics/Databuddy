'use client';

import type { ProfileData } from '@databuddy/shared';
import { getCountryName } from '@databuddy/shared';
import { SpinnerIcon, UsersIcon } from '@phosphor-icons/react';
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from '@tanstack/react-table';
import dayjs from 'dayjs';
import { useAtom } from 'jotai';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserIcon, CountryFlag, OSIcon } from '@/components/icon';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { useDateFilters } from '@/hooks/use-date-filters';
import { useProfilesData } from '@/hooks/use-dynamic-query';
import { getDeviceIcon } from '@/lib/utils';
import { dynamicQueryFiltersAtom } from '@/stores/jotai/filterAtoms';
import { generateProfileName } from '../[userId]/_components/generate-profile-name';

interface UsersListProps {
	websiteId: string;
}

export function UsersList({ websiteId }: UsersListProps) {
	const router = useRouter();
	const { dateRange } = useDateFilters();
	const [filters] = useAtom(dynamicQueryFiltersAtom);

	const [page, setPage] = useState(1);
	const [allUsers, setAllUsers] = useState<ProfileData[]>([]);
	const [loadMoreRef, setLoadMoreRef] = useState<HTMLTableCellElement | null>(
		null
	);
	const [scrollContainerRef, setScrollContainerRef] =
		useState<HTMLDivElement | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	const { profiles, pagination, isLoading, isError, error } = useProfilesData(
		websiteId,
		dateRange,
		50,
		page,
		filters
	);

	useEffect(() => {
		setPage(1);
		setAllUsers([]);
		setIsInitialLoad(true);
	}, [dateRange, filters]);

	const handleIntersection = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			const [entry] = entries;
			if (entry?.isIntersecting && pagination.hasNext && !isLoading) {
				setPage((prev) => prev + 1);
			}
		},
		[pagination.hasNext, isLoading]
	);

	useEffect(() => {
		if (!loadMoreRef || !scrollContainerRef) {
			return;
		}

		const observer = new IntersectionObserver(handleIntersection, {
			root: scrollContainerRef,
			threshold: 0.1,
			rootMargin: '300px',
		});

		observer.observe(loadMoreRef);

		return () => {
			observer.disconnect();
		};
	}, [loadMoreRef, scrollContainerRef, handleIntersection]);

	useEffect(() => {
		if (!profiles?.length) {
			return;
		}

		setAllUsers((prev) => {
			const existingUsers = new Map(prev.map((u) => [u.visitor_id, u]));
			let hasNewUsers = false;

			for (const profile of profiles) {
				if (!existingUsers.has(profile.visitor_id)) {
					existingUsers.set(profile.visitor_id, profile);
					hasNewUsers = true;
				}
			}

			if (hasNewUsers) {
				return Array.from(existingUsers.values());
			}

			return prev;
		});
		setIsInitialLoad(false);
	}, [profiles]);

	const columns = useMemo<ColumnDef<ProfileData>[]>(
		() => [
			{
				id: 'index',
				header: '#',
				cell: ({ row }) => (
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-sm">
						{row.index + 1}
					</div>
				),
				size: 60,
			},
			{
				id: 'user_id',
				header: 'User',
				accessorKey: 'visitor_id',
				cell: ({ row }) => {
					const profileName = generateProfileName(row.original.visitor_id);
					return (
						<div className="flex items-center gap-2">
							<div className="min-w-0">
								<div className="truncate font-semibold text-foreground text-sm">
									{profileName}
								</div>
								<div className="truncate text-muted-foreground text-xs">
									ID: {row.original.visitor_id.slice(-8)}
								</div>
							</div>
						</div>
					);
				},
				size: 200,
			},
			{
				id: 'location',
				header: 'Location',
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<CountryFlag country={row.original.country} size="sm" />
						<div className="min-w-0">
							<div className="truncate font-medium text-foreground text-sm">
								{getCountryName(row.original.country) || 'Unknown'}
							</div>
							{row.original.region && row.original.region !== 'Unknown' && (
								<div className="truncate text-muted-foreground text-xs">
									{row.original.region}
								</div>
							)}
						</div>
					</div>
				),
				size: 180,
			},
			{
				id: 'device',
				header: 'Device & Browser',
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<div className="flex items-center gap-1">
							{getDeviceIcon(row.original.device)}
							<BrowserIcon name={row.original.browser} size="sm" />
							<OSIcon name={row.original.os} size="sm" />
						</div>
						<div className="min-w-0">
							<div className="truncate font-medium text-foreground text-sm">
								{row.original.browser}
							</div>
							<div className="truncate text-muted-foreground text-xs">
								{row.original.os}
							</div>
						</div>
					</div>
				),
				size: 200,
			},
			{
				id: 'sessions',
				header: 'Sessions',
				accessorKey: 'total_sessions',
				cell: ({ row }) => (
					<div className="text-center">
						<div className="font-semibold text-foreground text-lg">
							{row.original.total_sessions}
						</div>
						<div className="text-muted-foreground text-xs">sessions</div>
					</div>
				),
				size: 100,
			},
			{
				id: 'pageviews',
				header: 'Pages',
				accessorKey: 'total_pageviews',
				cell: ({ row }) => (
					<div className="text-center">
						<div className="font-semibold text-foreground text-lg">
							{row.original.total_pageviews}
						</div>
						<div className="text-muted-foreground text-xs">pages</div>
					</div>
				),
				size: 100,
			},
			{
				id: 'type',
				header: 'Type',
				cell: ({ row }) => {
					const isReturning = row.original.total_sessions > 1;
					return (
						<div className="flex justify-center">
							<Badge
								className="px-2 py-1 font-semibold text-xs"
								variant={isReturning ? 'default' : 'secondary'}
							>
								{isReturning ? 'Return' : 'New'}
							</Badge>
						</div>
					);
				},
				size: 100,
			},
			{
				id: 'last_visit',
				header: 'Last Visit',
				accessorKey: 'last_visit',
				cell: ({ row }) => (
					<div>
						<div className="font-medium text-foreground text-sm">
							{row.original.last_visit
								? dayjs(row.original.last_visit).format('MMM D, YYYY')
								: 'Unknown'}
						</div>
						<div className="text-muted-foreground text-xs">
							{row.original.last_visit
								? dayjs(row.original.last_visit).format('HH:mm')
								: ''}
						</div>
					</div>
				),
				size: 150,
			},
		],
		[]
	);

	const table = useReactTable({
		data: allUsers,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row) => row.visitor_id,
	});

	if (isLoading && isInitialLoad) {
		return (
			<div className="flex h-full flex-col">
				<div className="h-[89px] border-b">
					<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-3">
								<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
									<UsersIcon className="h-5 w-5 text-primary" />
								</div>
								<div className="min-w-0 flex-1">
									<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
										Users
									</h1>
									<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
										View detailed visitor profiles and activity
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<div className="overflow-auto">
						<Table>
							<TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm">
								<TableRow>
									{columns.map((column) => (
										<TableHead key={column.id}>
											{typeof column.header === 'string'
												? column.header
												: null}
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{Array.from({ length: 12 }).map((_, i) => (
									<TableRow key={i}>
										{columns.map((column) => (
											<TableCell key={column.id}>
												<Skeleton className="h-6 w-full" />
											</TableCell>
										))}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					<div className="flex items-center justify-center border-t py-4">
						<div className="flex items-center gap-2 text-muted-foreground">
							<SpinnerIcon className="h-4 w-4 animate-spin" />
							<span className="text-sm">Loading users...</span>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex h-full flex-col">
				{/* Header */}
				<div className="h-[89px] border-b">
					<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-3">
								<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
									<UsersIcon className="h-5 w-5 text-primary" />
								</div>
								<div className="min-w-0 flex-1">
									<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
										Users
									</h1>
									<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
										View detailed visitor profiles and activity
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="flex min-h-0 flex-1 flex-col items-center justify-center py-24 text-center text-muted-foreground">
					<UsersIcon className="mb-4 h-12 w-12 opacity-50" />
					<p className="mb-2 font-medium text-lg">Failed to load users</p>
					<p className="text-sm">
						{error?.message || 'There was an error loading the users'}
					</p>
				</div>
			</div>
		);
	}

	if (!allUsers || allUsers.length === 0) {
		return (
			<div className="flex h-full flex-col">
				{/* Header */}
				<div className="h-[89px] border-b">
					<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-3">
								<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
									<UsersIcon className="h-5 w-5 text-primary" />
								</div>
								<div className="min-w-0 flex-1">
									<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
										Users
									</h1>
									<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
										View detailed visitor profiles and activity
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="flex min-h-0 flex-1 flex-col items-center justify-center py-24 text-center text-muted-foreground">
					<UsersIcon className="mb-4 h-12 w-12 opacity-50" />
					<p className="mb-2 font-medium text-lg">No users found</p>
					<p className="text-sm">
						Users will appear here once visitors browse your website
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="h-[89px] border-b">
				<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-3">
							<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
								<UsersIcon className="h-5 w-5 text-primary" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
										Users
									</h1>
									<span className="rounded bg-muted px-2 py-1 font-medium text-muted-foreground text-sm">
										{allUsers.length}
									</span>
									{isLoading && !isInitialLoad && (
										<div className="flex items-center gap-1.5 rounded bg-primary/10 px-2 py-1 text-primary">
											<SpinnerIcon className="h-3 w-3 animate-spin" />
											<span className="font-medium text-xs">Loading...</span>
										</div>
									)}
								</div>
								<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
									View detailed visitor profiles and activity
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="overflow-auto" ref={setScrollContainerRef}>
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm">
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow key={headerGroup.id}>
									{headerGroup.headers.map((header) => (
										<TableHead
											key={header.id}
											style={{
												width: header.getSize(),
											}}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext()
													)}
										</TableHead>
									))}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{table.getRowModel().rows.map((row) => (
								<TableRow
									className="cursor-pointer"
									key={row.id}
									onClick={() => {
										router.push(
											`/websites/${websiteId}/users/${row.original.visitor_id}`
										);
									}}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											style={{
												width: cell.column.getSize(),
											}}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</TableCell>
									))}
								</TableRow>
							))}

							{/* Load more trigger row */}
							{pagination.hasNext && (
								<TableRow>
									<TableCell
										className="h-16 text-center"
										colSpan={columns.length}
										ref={setLoadMoreRef}
									>
										{isLoading && (
											<div className="flex items-center justify-center gap-2 text-muted-foreground">
												<SpinnerIcon className="h-4 w-4 animate-spin" />
												<span className="text-sm">Loading more users...</span>
											</div>
										)}
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</div>
		</div>
	);
}
