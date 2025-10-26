'use client';

import {
	ArrowLeftIcon,
	SpinnerIcon,
	UserIcon,
	ClockIcon,
	CalendarIcon,
	ChartLineIcon,
	EyeIcon,
	CursorClickIcon,
	MapPinIcon,
	DevicesIcon,
	GlobeIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { BrowserIcon, CountryFlag, OSIcon } from '@/components/icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDateFilters } from '@/hooks/use-date-filters';
import { useUserProfile } from '@/hooks/use-dynamic-query';
import { getDeviceIcon } from '@/lib/utils';
import { SessionRow } from './_components/session-row';
import { generateProfileName } from './_components/generate-profile-name';
import { getCountryCode } from '@databuddy/shared';
import type { Session } from '@databuddy/shared';

export default function UserDetailPage() {
	const { id: websiteId, userId } = useParams();
	const router = useRouter();
	const { dateRange } = useDateFilters();
	const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
		new Set()
	);

	const { userProfile, isLoading, isError, error } = useUserProfile(
		websiteId as string,
		userId as string,
		dateRange
	);

	const handleToggleSession = useCallback((sessionId: string) => {
		setExpandedSessions((prev) => {
			const next = new Set(prev);
			if (next.has(sessionId)) {
				next.delete(sessionId);
			} else {
				next.add(sessionId);
			}
			return next;
		});
	}, []);

	const transformSession = useCallback((session: any): Session => {
		const countryCode = getCountryCode(session.country || '');
		return {
			session_id: session.session_id,
			first_visit: session.first_visit,
			last_visit: session.last_visit,
			page_views: session.page_views,
			visitor_id: userId as string,
			country: countryCode,
			country_name: session.country || '',
			country_code: countryCode,
			referrer: session.referrer || '',
			device_type: session.device || '',
			browser_name: session.browser || '',
			os_name: session.os || '',
			events: session.events || [],
			session_name: session.session_name,
		} as Session;
	}, [userId]);

	const totalEvents =
		userProfile?.sessions?.reduce(
			(acc: number, s: any) =>
				acc + (Array.isArray(s.events) ? s.events.length : 0),
			0
		) || 0;
	const totalPages =
		userProfile?.sessions?.reduce(
			(acc: number, s: any) => acc + (Number(s.page_views) || 0),
			0
		) || 0;
	const avgPagesPerSession = userProfile?.total_sessions
		? totalPages / userProfile.total_sessions
		: 0;

	const handleBack = () => {
		router.push(`/websites/${websiteId}/users`);
	};

	if (isLoading) {
		return (
			<div className="flex h-full flex-col">
				<div className="h-12 border-b bg-background">
					<div className="flex h-full items-center justify-between">
						<div className="flex h-full items-center">
							<Button
								className="h-full w-24 cursor-pointer rounded-none border-r px-0"
								onClick={handleBack}
								variant="ghost"
							>
								<ArrowLeftIcon className="h-4 w-4" />
							</Button>
							<div className="flex items-center gap-2 px-3">
								<div className="h-4 w-6 animate-pulse rounded bg-muted" />
								<div>
									<div className="h-4 w-32 animate-pulse rounded bg-muted" />
									<div className="mt-1 h-3 w-24 animate-pulse rounded bg-muted" />
								</div>
							</div>
						</div>
						<div className="px-3">
							<div className="h-5 w-16 animate-pulse rounded bg-muted" />
						</div>
					</div>
				</div>

				<div className="flex min-h-0 flex-1 items-center justify-center">
					<div className="flex items-center gap-2 text-muted-foreground">
						<SpinnerIcon className="h-6 w-6 animate-spin" />
						<span>Loading user details...</span>
					</div>
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex h-full flex-col">
				<div className="h-12 border-b bg-background">
					<div className="flex h-full items-center justify-between">
						<div className="flex h-full items-center">
							<Button
								className="h-full w-24 cursor-pointer rounded-none border-r px-0"
								onClick={handleBack}
								variant="ghost"
							>
								<ArrowLeftIcon className="h-4 w-4" />
							</Button>
							<div className="flex items-center gap-2 px-3">
								<div className="h-4 w-6 rounded bg-muted" />
								<div>
									<div className="h-4 w-32 rounded bg-muted" />
									<div className="mt-1 h-3 w-24 rounded bg-muted" />
								</div>
							</div>
						</div>
						<div className="px-3">
							<div className="h-5 w-16 rounded bg-muted" />
						</div>
					</div>
				</div>

				<div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center text-muted-foreground">
					<UserIcon className="mb-4 h-12 w-12 opacity-50" />
					<p className="mb-2 font-medium text-lg">Failed to load user</p>
					<p className="text-sm">
						{error?.message || 'Please try again later'}
					</p>
				</div>
			</div>
		);
	}

	if (!userProfile) {
		return (
			<div className="flex h-full flex-col">
				<div className="h-12 border-b bg-background">
					<div className="flex h-full items-center justify-between">
						<div className="flex h-full items-center">
							<Button
								className="h-full w-24 cursor-pointer rounded-none border-r px-0"
								onClick={handleBack}
								variant="ghost"
							>
								<ArrowLeftIcon className="h-4 w-4" />
							</Button>
							<div className="flex items-center gap-2 px-3">
								<div className="h-4 w-6 rounded bg-muted" />
								<div>
									<div className="h-4 w-32 rounded bg-muted" />
									<div className="mt-1 h-3 w-24 rounded bg-muted" />
								</div>
							</div>
						</div>
						<div className="px-3">
							<div className="h-5 w-16 rounded bg-muted" />
						</div>
					</div>
				</div>

				<div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center text-muted-foreground">
					<UserIcon className="mb-4 h-12 w-12 opacity-50" />
					<p className="mb-2 font-medium text-lg">User not found</p>
					<p className="text-sm">
						The user with ID "{userId}" was not found in the current date range.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="h-12 border-b bg-background">
				<div className="flex h-full items-center justify-between">
					<div className="flex h-full items-center">
						<Button
							className="h-full w-24 cursor-pointer rounded-none border-r px-0"
							onClick={handleBack}
							variant="ghost"
						>
							<ArrowLeftIcon className="h-4 w-4" />
						</Button>
						<div className="flex items-center gap-2 px-3">
							<CountryFlag country={getCountryCode(userProfile.country || '')} size="sm" />
							<div>
								<h1 className="font-semibold text-foreground text-sm">
									{generateProfileName(userProfile.visitor_id)}
								</h1>
								<p className="text-muted-foreground text-xs">
									{userProfile.region && userProfile.region !== 'Unknown'
										? `${userProfile.region}, `
										: ''}
									{userProfile.country || 'Unknown'}
								</p>
							</div>
						</div>
					</div>
					<div className="px-3">
						<Badge
							className="px-2 py-0.5 font-semibold text-xs"
							variant={
								userProfile.total_sessions > 1 ? 'default' : 'secondary'
							}
						>
							{userProfile.total_sessions > 1 ? 'Returning' : 'New'}
						</Badge>
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="grid min-h-0 grid-cols-1 lg:grid-cols-3">
					{/* User Overview */}
					<div className="border-b bg-background lg:h-[calc(100vh-89px)] lg:overflow-auto lg:border-r lg:border-b-0">
						{/* Hero Stats */}
						<div className="border-b">
							<div className="grid grid-cols-2">
								<div className="border-r px-4 py-3">
									<div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
										<ChartLineIcon className="h-3.5 w-3.5" />
										<span className="text-xs">Sessions</span>
									</div>
									<div className="font-bold text-2xl text-foreground">
										{userProfile.total_sessions}
									</div>
								</div>
								<div className="px-4 py-3">
									<div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
										<EyeIcon className="h-3.5 w-3.5" />
										<span className="text-xs">Pageviews</span>
									</div>
									<div className="font-bold text-2xl text-foreground">
										{userProfile.total_pageviews}
									</div>
								</div>
							</div>
						</div>

						{/* Quick Stats */}
						<div className="grid grid-cols-2 border-b">
							<div className="border-r px-4 py-3">
								<div className="mb-2 flex items-center gap-2">
									<CursorClickIcon className="h-4 w-4 text-muted-foreground" />
									<span className="font-medium text-muted-foreground text-xs">
										Events
									</span>
								</div>
								<div className="font-bold text-foreground text-xl">
									{totalEvents}
								</div>
							</div>

							<div className="px-4 py-3">
								<div className="mb-2 flex items-center gap-2">
									<ChartLineIcon className="h-4 w-4 text-muted-foreground" />
									<span className="font-medium text-muted-foreground text-xs">
										Avg Pages
									</span>
								</div>
								<div className="font-bold text-foreground text-xl">
									{avgPagesPerSession.toFixed(1)}
								</div>
							</div>
						</div>

						{/* Location */}
						<div className="border-b px-4 py-3">
							<div className="mb-3 flex items-center gap-2">
								<MapPinIcon className="h-4 w-4 text-muted-foreground" />
								<span className="font-semibold text-foreground text-sm">
									Location
								</span>
							</div>
							<div className="flex items-center gap-3">
								<CountryFlag country={getCountryCode(userProfile.country || '')} size="md" />
								<div className="font-medium text-foreground">
									{userProfile.region && userProfile.region !== 'Unknown'
										? `${userProfile.region}, `
										: ''}
									{userProfile.country || 'Unknown'}
								</div>
							</div>
						</div>

						{/* Tech Stack */}
						<div className="border-b px-4 py-3">
							<div className="mb-3 flex items-center gap-2">
								<DevicesIcon className="h-4 w-4 text-muted-foreground" />
								<span className="font-semibold text-foreground text-sm">
									Technology
								</span>
							</div>
							<div className="space-y-3">
								<div className="flex items-center gap-3">
									{getDeviceIcon(userProfile.device)}
									<div className="min-w-0 flex-1">
										<div className="text-muted-foreground text-xs">Device</div>
										<div className="truncate font-medium text-sm">
											{userProfile.device}
										</div>
									</div>
								</div>
								<div className="flex items-center gap-3">
									<BrowserIcon name={userProfile.browser} size="md" />
									<div className="min-w-0 flex-1">
										<div className="text-muted-foreground text-xs">Browser</div>
										<div className="truncate font-medium text-sm">
											{userProfile.browser}
										</div>
									</div>
								</div>
								<div className="flex items-center gap-3">
									<OSIcon name={userProfile.os} size="md" />
									<div className="min-w-0 flex-1">
										<div className="text-muted-foreground text-xs">
											Operating System
										</div>
										<div className="truncate font-medium text-sm">
											{userProfile.os}
										</div>
									</div>
								</div>
							</div>
						</div>

						{/* Timeline */}
						<div className="px-4 py-3">
							<div className="mb-3 flex items-center gap-2">
								<ClockIcon className="h-4 w-4 text-muted-foreground" />
								<span className="font-semibold text-foreground text-sm">
									Timeline
								</span>
							</div>
							<div className="space-y-3">
								<div className="flex items-start gap-3">
									<CalendarIcon className="mt-1 h-4 w-4 text-muted-foreground" />
									<div className="min-w-0 flex-1">
										<div className="text-muted-foreground text-xs">
											First Visit
										</div>
										<div className="font-medium text-sm">
											{userProfile.first_visit
												? dayjs(userProfile.first_visit).format('MMM D, YYYY')
												: 'Unknown'}
										</div>
										<div className="text-muted-foreground text-xs">
											{userProfile.first_visit
												? dayjs(userProfile.first_visit).format('HH:mm')
												: ''}
										</div>
									</div>
								</div>

								<div className="flex items-start gap-3">
									<CalendarIcon className="mt-1 h-4 w-4 text-muted-foreground" />
									<div className="min-w-0 flex-1">
										<div className="text-muted-foreground text-xs">
											Last Visit
										</div>
										<div className="font-medium text-sm">
											{userProfile.last_visit
												? dayjs(userProfile.last_visit).format('MMM D, YYYY')
												: 'Unknown'}
										</div>
										<div className="text-muted-foreground text-xs">
											{userProfile.last_visit
												? dayjs(userProfile.last_visit).format('HH:mm')
												: ''}
										</div>
									</div>
								</div>

								<div className="flex items-start gap-3">
									<ClockIcon className="mt-1 h-4 w-4 text-muted-foreground" />
									<div className="min-w-0 flex-1">
										<div className="text-muted-foreground text-xs">
											Total Time Spent
										</div>
										<div className="font-medium text-sm">
											{userProfile.total_duration_formatted || '0s'}
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* Sessions List */}
					<div className="lg:col-span-2 lg:h-[calc(100vh-89px)] lg:overflow-auto">
						<div>
							{userProfile.sessions && userProfile.sessions.length > 0 ? (
								<div className="divide-y">
									{userProfile.sessions.map((session, index: number) => (
										<SessionRow
											key={session.session_id}
											session={transformSession(session)}
											index={index}
											isExpanded={expandedSessions.has(session.session_id)}
											onToggle={handleToggleSession}
										/>
									))}
								</div>
							) : (	
								<div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center text-muted-foreground">
									<UserIcon className="mx-auto mb-4 h-8 w-8 opacity-50" />
									<p className="text-sm">
										No sessions data available for this user
									</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
