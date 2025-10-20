'use client';

import type { Session, SessionsListProps } from '@databuddy/shared';
import { SpinnerIcon, UserIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useDateFilters } from '@/hooks/use-date-filters';
import { useDynamicQuery } from '@/hooks/use-dynamic-query';
import { dynamicQueryFiltersAtom } from '@/stores/jotai/filterAtoms';
import {
	expandedSessionIdAtom,
	getSessionPageAtom,
} from '@/stores/jotai/sessionAtoms';
import { SessionRow } from './session-row';

export function SessionsList({ websiteId }: SessionsListProps) {
	const { dateRange } = useDateFilters();
	const [filters] = useAtom(dynamicQueryFiltersAtom);

	const [expandedSessionId, setExpandedSessionId] = useAtom(
		expandedSessionIdAtom
	);
	const [page, setPage] = useAtom(getSessionPageAtom(websiteId));
	const loadMoreRef = useRef<HTMLDivElement>(null);

	const { data, isLoading, isError, error } = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id: 'sessions-list',
			parameters: ['session_list'],
			limit: 50,
			page,
			filters: filters.length > 0 ? filters : undefined,
		},
		{
			staleTime: 5 * 60 * 1000,
			gcTime: 10 * 60 * 1000,
		}
	);

	const [allSessions, setAllSessions] = useState<Session[]>([]);

	// Accumulate sessions directly from API
	useEffect(() => {
		if (!data?.session_list) {
			return;
		}

		const sessions = (data.session_list as Session[]) || [];

		if (page === 1) {
			setAllSessions(sessions);
		} else {
			setAllSessions((prev) => {
				const existingIds = new Set(prev.map((session) => session.session_id));
				const newSessions = sessions.filter(
					(session) => !existingIds.has(session.session_id)
				);
				return [...prev, ...newSessions];
			});
		}
	}, [data, page]);

	const hasNextPage = useMemo(() => {
		const currentPageData = (data?.session_list as Session[]) || [];
		return currentPageData.length === 50;
	}, [data]);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry?.isIntersecting && hasNextPage && !isLoading) {
					setPage(page + 1);
				}
			},
			{ threshold: 0.1 }
		);

		const currentRef = loadMoreRef.current;
		if (currentRef) {
			observer.observe(currentRef);
		}

		return () => {
			if (currentRef) {
				observer.unobserve(currentRef);
			}
		};
	}, [hasNextPage, isLoading, setPage, page]);

	const toggleSession = useCallback(
		(sessionId: string) => {
			setExpandedSessionId((currentId) =>
				currentId === sessionId ? null : sessionId
			);
		},
		[setExpandedSessionId]
	);

	// Loading state for first page
	if (isLoading && page === 1 && allSessions.length === 0) {
		return (
			<Card>
				<CardContent className="p-6">
					<div className="space-y-4">
						{Array.from({ length: 6 }, (_, i) => (
							<div
								className="h-16 animate-pulse rounded bg-muted/20"
								key={`skeleton-${i.toString()}`}
							/>
						))}
					</div>
					<div className="flex items-center justify-center pt-6">
						<div className="flex items-center gap-2 text-muted-foreground">
							<SpinnerIcon className="h-4 w-4 animate-spin" />
							<span className="text-sm">Loading sessions...</span>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	// Error state
	if (isError) {
		return (
			<Card>
				<CardContent className="flex items-center justify-center p-12">
					<div className="text-center text-muted-foreground">
						<UserIcon className="mx-auto mb-4 h-12 w-12 opacity-50" />
						<p className="mb-2 font-medium text-lg">Failed to load sessions</p>
						<p className="text-sm">
							{error?.message || 'Please try again later'}
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	// Empty state
	if (!(allSessions.length || isLoading)) {
		return (
			<Card className="border-sidebar-border bg-sidebar/20">
				<CardContent className="flex items-center justify-center p-16">
					<div className="max-w-md text-center">
						<UserIcon
							className="mx-auto mb-6 h-12 w-12 text-muted-foreground"
							weight="duotone"
						/>
						<h3 className="mb-3 font-semibold text-lg">No sessions found</h3>
						<p className="text-muted-foreground text-sm leading-relaxed">
							Sessions will appear here once users visit your website. Each
							session represents a unique visitor's journey through your site.
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent className="p-0">
				<div className="divide-y divide-border">
					{allSessions.map((session, index) => (
						<SessionRow
							index={index}
							isExpanded={expandedSessionId === session.session_id}
							key={session.session_id}
							onToggle={toggleSession}
							session={session}
						/>
					))}
				</div>

				{/* Infinite scroll trigger */}
				{hasNextPage && (
					<div className="border-t p-4" ref={loadMoreRef}>
						<div className="flex items-center justify-center gap-2 text-muted-foreground">
							<SpinnerIcon className="h-4 w-4 animate-spin" />
							<span className="text-sm">Loading more sessions...</span>
						</div>
					</div>
				)}

				{!hasNextPage && allSessions.length > 0 && (
					<div className="border-t p-4 text-center text-muted-foreground text-sm">
						All sessions loaded
					</div>
				)}
			</CardContent>
		</Card>
	);
}
