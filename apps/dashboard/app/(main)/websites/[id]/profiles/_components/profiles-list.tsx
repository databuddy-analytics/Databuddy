'use client';

import { Loader2Icon } from 'lucide-react';
import { UsersIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useProfilesData } from '@/hooks/use-dynamic-query';

// Type adapter for the new profile data structure
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

import { WebsitePageHeader } from '../../_components/website-page-header';
import { ProfileRow } from './profile-row';
import { getDefaultDateRange } from './profile-utils';

interface ProfilesListProps {
	websiteId: string;
}

export function ProfilesList({ websiteId }: ProfilesListProps) {
	const [dateRange] = useState(() => getDefaultDateRange());
	const [expandedProfileId, setExpandedProfileId] = useState<string | null>(
		null
	);
	const [page, setPage] = useState(1);
	const [allProfiles, setAllProfiles] = useState<ProfileData[]>([]);
	const [loadMoreRef, setLoadMoreRef] = useState<HTMLDivElement | null>(null);

	const [isInitialLoad, setIsInitialLoad] = useState(true);

	const { profiles, pagination, isLoading, isError, error } = useProfilesData(
		websiteId,
		dateRange,
		25,
		page
	);

	const toggleProfile = useCallback((profileId: string) => {
		setExpandedProfileId((currentId) =>
			currentId === profileId ? null : profileId
		);
	}, []);

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
			setAllProfiles((prev) => {
				const existingProfiles = new Map(prev.map((p) => [p.visitor_id, p]));
				let hasNewProfiles = false;

				for (const profile of profiles) {
					if (!existingProfiles.has(profile.visitor_id)) {
						existingProfiles.set(
							profile.visitor_id,
							profile as unknown as ProfileData
						);
						hasNewProfiles = true;
					}
				}

				if (hasNewProfiles) {
					return Array.from(existingProfiles.values());
				}

				return prev;
			});
			setIsInitialLoad(false);
		}
	}, [profiles]);

	if (isLoading && isInitialLoad) {
		return (
			<div className="space-y-6">
				<WebsitePageHeader
					description="Visitor profiles with session data and behavior patterns"
					icon={<UsersIcon className="h-6 w-6 text-primary" />}
					title="Recent Profiles"
					variant="minimal"
					websiteId={websiteId}
				/>
				<Card>
					<CardContent>
						<div className="space-y-3">
							{[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
								<div
									className="h-16 animate-pulse rounded bg-muted/20"
									key={i}
								/>
							))}
						</div>
						<div className="flex items-center justify-center pt-4">
							<div className="flex items-center gap-2 text-muted-foreground">
								<Loader2Icon className="h-4 w-4 animate-spin" />
								<span className="text-sm">Loading profiles...</span>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="space-y-6">
				<WebsitePageHeader
					description="Visitor profiles with session data and behavior patterns"
					errorMessage={error?.message || 'Failed to load profiles'}
					hasError={true}
					icon={<UsersIcon className="h-6 w-6 text-primary" />}
					title="Recent Profiles"
					variant="minimal"
					websiteId={websiteId}
				/>
			</div>
		);
	}

	if (!allProfiles || allProfiles.length === 0) {
		return (
			<div className="space-y-6">
				<WebsitePageHeader
					description="Visitor profiles with session data and behavior patterns"
					icon={<UsersIcon className="h-6 w-6 text-primary" />}
					title="Recent Profiles"
					variant="minimal"
					websiteId={websiteId}
				/>
				<Card>
					<CardContent>
						<div className="flex flex-col items-center py-12 text-center text-muted-foreground">
							<UsersIcon className="mb-4 h-12 w-12 opacity-50" />
							<p className="mb-2 font-medium text-lg">No profiles found</p>
							<p className="text-sm">
								Visitor profiles will appear here once users visit your website
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<WebsitePageHeader
				description="Visitor profiles with session data and behavior patterns"
				icon={<UsersIcon className="h-6 w-6 text-primary" />}
				subtitle={`${allProfiles.length} loaded`}
				title="Recent Profiles"
				variant="minimal"
				websiteId={websiteId}
			/>
			<Card>
				<CardContent className="p-0">
					<div className="divide-y divide-border">
						{allProfiles.map((profile: ProfileData, index: number) => (
							<ProfileRow
								index={index}
								isExpanded={expandedProfileId === profile.visitor_id}
								key={`${profile.visitor_id}-${index}`}
								onToggle={() => toggleProfile(profile.visitor_id)}
								profile={profile}
							/>
						))}
					</div>

					<div className="border-t p-4" ref={setLoadMoreRef}>
						{pagination.hasNext ? (
							<div className="flex justify-center">
								{isLoading ? (
									<div className="flex items-center gap-2 text-muted-foreground">
										<Loader2Icon className="h-4 w-4 animate-spin" />
										<span className="text-sm">Loading more profiles...</span>
									</div>
								) : null}
							</div>
						) : (
							<div className="text-center text-muted-foreground text-sm">
								{allProfiles.length > 0
									? 'All profiles loaded'
									: 'No more profiles'}
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
