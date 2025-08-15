'use client';

import { SpinnerIcon, UserIcon } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import z from 'zod/v4';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSessionsData } from '@/hooks/use-dynamic-query';
import { useAutocompleteData } from '@/hooks/use-funnels';
import SessionsFilters, { buildSessionFilters, type FilterItem } from './sessions-filters';
import { WebsitePageHeader } from '../../_components/website-page-header';
import { getDefaultDateRange } from './session-utils';

const SessionRow = dynamic(
	() => import('./session-row').then((mod) => ({ default: mod.SessionRow })),
	{
		loading: () => (
			<div className="flex items-center justify-center p-4">
				<SpinnerIcon className="h-4 w-4 animate-spin" />
			</div>
		),
	}
);

interface SessionsListProps {
	websiteId: string;
}

// Zod schema for validating FilterItem arrays from URL params
const FilterItemSchema = z.object({
	id: z.string().optional(), // Optional for backward compatibility with URL params
	field: z.enum(['path', 'referrer', 'country', 'browser_name', 'os_name']),
	value: z.string(),
});

const FilterItemArraySchema = z.array(FilterItemSchema);

// Type guard function to validate FilterItem array
function isValidFilterItemArray(value: unknown): value is FilterItem[] {
	const result = FilterItemArraySchema.safeParse(value);
	return result.success;
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
	const [allSessions, setAllSessions] = useState<any[]>([]);
	const [loadMoreRef, setLoadMoreRef] = useState<HTMLDivElement | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Initialize filters from URL with validation
  const [filterItems, setFilterItems] = useState<FilterItem[]>(() => {
    const filtersParam = searchParams.get('filters');
    if (filtersParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(filtersParam));
        // Validate the parsed data matches FilterItem[] shape
        if (isValidFilterItemArray(parsed)) {
          return parsed;
        }
        // Invalid data structure, fall back to empty array
        return [];
      } catch {
        // JSON parsing failed, fall back to empty array
        return [];
      }
    }
    return [];
  });

  const { sessions, pagination, isLoading, isError, error } = useSessionsData(
		websiteId,
		dateRange,
		50,
    page,
    {
      filters: buildSessionFilters(filterItems),
    }
	);
	const [page, setPage] = useAtom(getSessionPageAtom(websiteId));
	const loadMoreRef = useRef<HTMLDivElement>(null);

  // Fetch unfiltered sessions data ONLY for getting browser/OS options
  const { sessions: unfilteredSessions } = useSessionsData(
    websiteId,
    dateRange,
    500, // Reasonable limit to capture browser/OS variety without overloading
    1,
    {} // No filters - get unfiltered data for metadata
  );

  // Memoize browser and OS options to avoid recalculation
  const browserOptions = useMemo(() => 
    Array.from(new Set(unfilteredSessions.map((s)=> s.browser).filter(Boolean))),
    [unfilteredSessions]
  );
  
  const osOptions = useMemo(() => 
    Array.from(new Set(unfilteredSessions.map((s)=> s.os).filter(Boolean))),
    [unfilteredSessions]
  );

  const { data: autocompleteData } = useAutocompleteData(websiteId);

  // Handle filter changes with URL persistence
  const handleFilterChange = useCallback((newFilters: FilterItem[]) => {
    setFilterItems(newFilters);
    
    // Update URL to persist filters
    const params = new URLSearchParams(searchParams.toString());
    if (newFilters.length > 0) {
      params.set('filters', encodeURIComponent(JSON.stringify(newFilters)));
    } else {
      params.delete('filters');
    }
    
    // Use replace to avoid cluttering browser history
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

	const toggleSession = useCallback((sessionId: string) => {
		setExpandedSessionId((currentId) =>
			currentId === sessionId ? null : sessionId
		);
	}, []);

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
			// Transform ClickHouse tuple events to objects
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
			// First page - replace all sessions
			setAllSessions(transformedSessions);
		} else {
			// Subsequent pages - append new sessions (deduplicate by session_id)
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
  }, [sessions]);

  useEffect(() => {
    setPage(1);
    setAllSessions([]);
    setExpandedSessionId(null);
    // Don't set isInitialLoad to true to prevent full page reload appearance
  }, [JSON.stringify(buildSessionFilters(filterItems))]);

  // Only show full loading state on the very first load
  if (isLoading && isInitialLoad) {
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

  // Show the layout with filters even when no sessions are found
  const hasNoSessions = !allSessions.length && !isLoading;
  const showEmptyState = hasNoSessions && filterItems.length === 0; // Only show generic empty state when no filters applied

  if (showEmptyState) {
    return (
      <div className="space-y-6">
        <WebsitePageHeader
          description="User sessions with event timelines and custom event properties"
          icon={<UserIcon className="h-6 w-6 text-primary" />}
          title="Recent Sessions"
          variant="minimal"
          websiteId={websiteId}
        />
        <Card>
          <CardContent className="flex items-center justify-center">
            <div className="flex flex-col items-center py-12 text-center text-muted-foreground">
              <UserIcon className="mb-4 h-12 w-12 opacity-50" />
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
				icon={<UserIcon className="h-6 w-6 text-primary" />}
				subtitle={`${allSessions.length} loaded`}
				title="Recent Sessions"
				variant="minimal"
				websiteId={websiteId}
			/>
      <Card>
        <CardContent className="p-0">
          <SessionsFilters
            filters={filterItems}
            onChange={handleFilterChange}
            browserOptions={browserOptions}
            osOptions={osOptions}
            autocompleteData={autocompleteData}
          />
        </CardContent>
      </Card>
			<Card>
				<CardContent className="p-0">
          {hasNoSessions ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center text-center text-muted-foreground">
                <UserIcon className="mb-4 h-8 w-8 opacity-50" />
                <p className="mb-1 font-medium">No sessions match your filters</p>
                <p className="text-sm">Try adjusting your filter criteria</p>
              </div>
            </div>
          ) : isLoading && allSessions.length === 0 ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  className="h-16 animate-pulse rounded bg-muted/20"
                  key={`skeleton-${i}`}
                />
              ))}
              <div className="flex items-center justify-center pt-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading sessions...</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {allSessions.map((session, index: number) => (
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
                        <SpinnerIcon className="h-4 w-4 animate-spin" />
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
            </>
          )}
				</CardContent>
			</Card>
		</div>
	);
}
