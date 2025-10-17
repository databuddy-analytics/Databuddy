'use client';

import { SpinnerIcon, UsersIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useState } from 'react';
import { useDateFilters } from '@/hooks/use-date-filters';
import { useProfilesData } from '@/hooks/use-dynamic-query';
import { dynamicQueryFiltersAtom } from '@/stores/jotai/filterAtoms';
import { UserRow } from './user-row';

type ProfileData = {
	visitor_id: string;
	first_visit: string;
	last_visit: string;
	total_sessions: number;
	total_pageviews: number;
	total_duration: number;
	total_duration_formatted: string;
	device: string;
	browser: string;
	os: string;
	country: string;
	region: string;
	sessions: Array<{
		session_id: string;
		session_name: string;
		first_visit: string;
		last_visit: string;
		duration: number;
		duration_formatted: string;
		page_views: number;
		unique_pages: number;
		device: string;
		browser: string;
		os: string;
		country: string;
		region: string;
		referrer: string;
		events: Array<{
			event_id: string;
			time: string;
			event_name: string;
			path: string;
			error_message?: string;
			error_type?: string;
			properties: Record<string, unknown>;
		}>;
	}>;
};

interface UsersListProps {
	websiteId: string;
}

export function UsersList({ websiteId }: UsersListProps) {
	const { dateRange } = useDateFilters();
	const [filters] = useAtom(dynamicQueryFiltersAtom);

	const [page, setPage] = useState(1);
	const [allUsers, setAllUsers] = useState<ProfileData[]>([]);
	const [loadMoreRef, setLoadMoreRef] = useState<HTMLDivElement | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	const { profiles, pagination, isLoading, isError, error } = useProfilesData(
		websiteId,
		dateRange,
		50, // Increased page size for better UX
		page,
		filters
	);

	// Reset page and users when dateRange or filters change
	useEffect(() => {
		setPage(1);
		setAllUsers([]);
		setIsInitialLoad(true);
	}, [dateRange, filters]);

	const handleIntersection = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			const [entry] = entries;
			if (entry.isIntersecting && pagination.hasNext && !isLoading) {
				setPage((prev) => prev + 1);
			}
		},
		[pagination.hasNext, isLoading]
	);

	useEffect(() => {
		if (!loadMoreRef) {
			return;
		}

		const observer = new IntersectionObserver(handleIntersection, {
			threshold: 0.1,
			rootMargin: '300px',
		});

		observer.observe(loadMoreRef);

		return () => {
			observer.disconnect();
		};
	}, [loadMoreRef, handleIntersection]);

	useEffect(() => {
		if (profiles?.length) {
			setAllUsers((prev) => {
				const existingUsers = new Map(prev.map((u) => [u.visitor_id, u]));
				let hasNewUsers = false;

				for (const profile of profiles) {
					if (!existingUsers.has(profile.visitor_id)) {
						existingUsers.set(
							profile.visitor_id,
							profile as unknown as ProfileData
						);
						hasNewUsers = true;
					}
				}

				if (hasNewUsers) {
					return Array.from(existingUsers.values());
				}

				return prev;
			});
			setIsInitialLoad(false);
		}
	}, [profiles]);

	if (isLoading && isInitialLoad) {
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

				{/* Loading skeletons */}
				<div className="flex min-h-0 flex-1 flex-col">
					<div className="space-y-0">
						{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
							<div
								className="h-20 animate-pulse bg-muted/10 even:bg-muted/20"
								key={i}
							/>
						))}
					</div>

					<div className="flex items-center justify-center py-12">
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
			<div className="flex min-h-0 flex-1 flex-col">
				{/* Header row with grid layout - sticky */}
				<div className="sticky top-0 z-10 grid grid-cols-12 items-center gap-4 border-b bg-muted/50 px-4 py-3 font-medium text-muted-foreground text-sm backdrop-blur-sm">
					<div className="col-span-1">#</div>
					<div className="col-span-2">User ID</div>
					<div className="col-span-2">Location</div>
					<div className="col-span-2">Device & Browser</div>
					<div className="col-span-1 text-center">Sessions</div>
					<div className="col-span-1 text-center">Pages</div>
					<div className="col-span-1 text-center">Type</div>
					<div className="col-span-2">Last Visit</div>
				</div>

				{/* User rows */}
				<div className="overflow-y-auto">
					{allUsers.map((user, index) => (
						<UserRow
							index={index}
							key={user.visitor_id}
							user={user}
							websiteId={websiteId}
						/>
					))}
				</div>

				{/* Load more indicator */}
				<div className="border-t px-4 py-6" ref={setLoadMoreRef}>
					{pagination.hasNext ? (
						<div className="flex justify-center">
							{isLoading ? (
								<div className="flex items-center gap-2 text-muted-foreground">
									<SpinnerIcon className="h-4 w-4 animate-spin" />
									<span className="text-sm">Loading more users...</span>
								</div>
							) : null}
						</div>
					) : (
						<div className="text-center text-muted-foreground text-sm">
							{allUsers.length > 0 ? 'All users loaded' : 'No more users'}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
