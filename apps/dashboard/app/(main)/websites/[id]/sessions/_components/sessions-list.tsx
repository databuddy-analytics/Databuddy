'use client';

import { Loader2Icon, UsersIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSessionsData } from '@/hooks/use-dynamic-query';
import { WebsitePageHeader } from '../../_components/website-page-header';
import { SessionRow } from './session-row';
import { getDefaultDateRange } from './session-utils';

interface SessionsListProps {
	websiteId: string;
}

// Type for the transformed session data structure
type SessionData = {
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
};

export function SessionsList({ websiteId }: SessionsListProps) {
	const [dateRange] = useState(() => getDefaultDateRange());
	const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
		null
	);
	const [page, setPage] = useState(1);
	const [allSessions, setAllSessions] = useState<SessionData[]>([]);
	const [loadMoreRef, setLoadMoreRef] = useState<HTMLDivElement | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	const { sessions, pagination, isLoading, isError, error } = useSessionsData(
		websiteId,
		dateRange,
		50,
		page
	);

	const toggleSession = useCallback((sessionId: string) => {
		setExpandedSessionId((currentId) =>
			currentId === sessionId ? null : sessionId
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
		if (sessions?.length) {
			setAllSessions((prev) => {
				const existingSessions = new Map(prev.map((s) => [s.session_id, s]));
				let hasNewSessions = false;

				for (const session of sessions) {
					if (!existingSessions.has(session.session_id)) {
						existingSessions.set(session.session_id, session);
						hasNewSessions = true;
					}
				}

				if (hasNewSessions) {
					return Array.from(existingSessions.values());
				}

				return prev;
			});
			setIsInitialLoad(false);
		}
	}, [sessions]);

	if (isLoading && isInitialLoad) {
		return (
			<div className="space-y-6">
				<WebsitePageHeader
					description="User sessions with event timelines and custom event properties"
					icon={<UsersIcon className="h-6 w-6 text-primary" />}
					title="Recent Sessions"
					variant="minimal"
					websiteId={websiteId}
				/>
				<Card className="py-0">
					<CardContent>
						<div className="space-y-3">
							{[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
								<div
									className="h-16 animate-pulse rounded bg-muted/20"
									key={`skeleton-${i}`}
								/>
							))}
						</div>
						<div className="flex items-center justify-center pt-4">
							<div className="flex items-center gap-2 text-muted-foreground">
								<Loader2Icon className="h-4 w-4 animate-spin" />
								<span className="text-sm">Loading sessions...</span>
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
					description="User sessions with event timelines and custom event properties"
					errorMessage={error?.message || 'Failed to load sessions'}
					hasError={true}
					icon={<UsersIcon className="h-6 w-6 text-primary" />}
					title="Recent Sessions"
					variant="minimal"
					websiteId={websiteId}
				/>
			</div>
		);
	}

	if (!allSessions.length) {
		return (
			<div className="space-y-6">
				<WebsitePageHeader
					description="User sessions with event timelines and custom event properties"
					icon={<UsersIcon className="h-6 w-6 text-primary" />}
					title="Recent Sessions"
					variant="minimal"
					websiteId={websiteId}
				/>
				<Card>
					<CardContent>
						<div className="py-12 text-center text-muted-foreground">
							<UsersIcon className="mx-auto mb-4 h-12 w-12 opacity-50" />
							<p className="mb-2 font-medium text-lg">No sessions found</p>
							<p className="text-sm">
								Sessions will appear here once users visit your website
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
				description="User sessions with event timelines and custom event properties"
				icon={<UsersIcon className="h-6 w-6 text-primary" />}
				subtitle={`${allSessions.length} loaded`}
				title="Recent Sessions"
				variant="minimal"
				websiteId={websiteId}
			/>
			<Card>
				<CardContent className="p-0">
					<div className="divide-y divide-border">
						{allSessions.map((session: SessionData, index: number) => (
							<SessionRow
								index={index}
								isExpanded={expandedSessionId === session.session_id}
								key={session.session_id || index}
								onToggle={toggleSession}
								session={session}
							/>
						))}
					</div>

					<div className="border-t p-4" ref={setLoadMoreRef}>
						{pagination.hasNext ? (
							<div className="flex justify-center">
								{isLoading ? (
									<div className="flex items-center gap-2 text-muted-foreground">
										<Loader2Icon className="h-4 w-4 animate-spin" />
										<span className="text-sm">Loading more sessions...</span>
									</div>
								) : (
									<Button
										className="w-full"
										onClick={() => setPage((prev) => prev + 1)}
										variant="outline"
									>
										Load More Sessions
									</Button>
								)}
							</div>
						) : (
							<div className="text-center text-muted-foreground text-sm">
								{allSessions.length > 0
									? 'All sessions loaded'
									: 'No more sessions'}
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
