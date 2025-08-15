'use client';

import { SpinnerIcon, UserIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useDynamicQuery } from '@/hooks/use-dynamic-query';
import {
	dynamicQueryFiltersAtom,
	formattedDateRangeAtom,
	timeGranularityAtom,
} from '@/stores/jotai/filterAtoms';
import {
	expandedSessionIdAtom,
	getSessionPageAtom,
} from '@/stores/jotai/sessionAtoms';
import { SessionRow } from './session-row';

// Transform ClickHouse tuple events to objects
function transformSessionEvents(events: unknown[]): Record<string, unknown>[] {
	return events
		.map((tuple: unknown) => {
			if (!Array.isArray(tuple) || tuple.length < 7) {
				return null;
			}

			const [
				id,
				time,
				event_name,
				path,
				error_message,
				error_type,
				properties,
			] = tuple;

			let propertiesObj = {};
			if (properties) {
				try {
					propertiesObj = JSON.parse(properties as string);
				} catch {
					// Keep empty object if parsing fails
				}
			}

			return {
				event_id: id,
				time,
				event_name,
				path,
				error_message,
				error_type,
				properties: propertiesObj,
			};
		})
		.filter(Boolean) as Record<string, unknown>[];
}

interface SessionsListProps {
	websiteId: string;
}

export function SessionsList({ websiteId }: SessionsListProps) {
	const [formattedDateRange] = useAtom(formattedDateRangeAtom);
	const [granularity] = useAtom(timeGranularityAtom);
	const [filters] = useAtom(dynamicQueryFiltersAtom);

	const [expandedSessionId, setExpandedSessionId] = useAtom(
		expandedSessionIdAtom
	);
	const [page, setPage] = useAtom(getSessionPageAtom(websiteId));
	const loadMoreRef = useRef<HTMLDivElement>(null);

	const dateRange = useMemo(
		() => ({
			start_date: formattedDateRange.startDate,
			end_date: formattedDateRange.endDate,
			granularity,
		}),
		[formattedDateRange, granularity]
	);

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

	// State to accumulate sessions across pages
	const [allSessions, setAllSessions] = useState<Record<string, unknown>[]>([]);

	// Transform and accumulate sessions
	useEffect(() => {
		if (!data?.session_list) {
			return;
		}

		const rawSessions = (data.session_list as unknown[]) || [];
		const transformedSessions = rawSessions.map((session: unknown) => {
			const sessionData = session as Record<string, unknown>;
			const events = Array.isArray(sessionData.events)
				? transformSessionEvents(sessionData.events)
				: [];

			return {
				...sessionData,
				events,
				session_name: sessionData.session_id
					? `Session ${String(sessionData.session_id).slice(-8)}`
					: 'Unknown Session',
			};
		});

		if (page === 1) {
			setAllSessions(transformedSessions);
		} else {
			setAllSessions((prev) => {
				const existingIds = new Set(
					prev.map((s) => (s as Record<string, unknown>).session_id)
				);
				const newSessions = transformedSessions.filter(
					(session) =>
						!existingIds.has((session as Record<string, unknown>).session_id)
				);
				return [...prev, ...newSessions];
			});
		}
	}, [data, page]);

	const hasNextPage = useMemo(() => {
		const currentPageData = (data?.session_list as unknown[]) || [];
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
			<Card>
				<CardContent className="flex items-center justify-center p-12">
					<div className="text-center text-muted-foreground">
						<UserIcon className="mx-auto mb-4 h-12 w-12 opacity-50" />
						<p className="mb-2 font-medium text-lg">No sessions found</p>
						<p className="text-sm">
							Sessions will appear here once users visit your website
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
					{allSessions.map((session, index) => {
						const sessionData = session as Record<string, unknown>;
						return (
							<SessionRow
								index={index}
								isExpanded={expandedSessionId === sessionData.session_id}
								key={sessionData.session_id as string}
								onToggle={toggleSession}
								session={session}
							/>
						);
					})}
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
