'use client';

import { ArrowLeftIcon, SpinnerIcon, UserIcon } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { useParams, useRouter } from 'next/navigation';
import { FaviconImage } from '@/components/analytics/favicon-image';
import { BrowserIcon, CountryFlag, OSIcon } from '@/components/icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDateFilters } from '@/hooks/use-date-filters';
import { useUserProfile } from '@/hooks/use-dynamic-query';
import { getDeviceIcon } from '@/lib/utils';

export default function UserDetailPage() {
	const { id: websiteId, userId } = useParams();
	const router = useRouter();
	const { dateRange } = useDateFilters();

	const { userProfile, isLoading, isError, error } = useUserProfile(
		websiteId as string,
		userId as string,
		dateRange
	);

	function getReferrerInfo(referrer?: string) {
		if (!referrer || referrer === 'direct') {
			return { name: 'Direct', domain: null } as {
				name: string;
				domain: string | null;
			};
		}
		try {
			const url = new URL(
				referrer.startsWith('http') ? referrer : `https://${referrer}`
			);
			const domain = url.hostname.replace('www.', '');
			return { name: domain, domain } as {
				name: string;
				domain: string | null;
			};
		} catch {
			return { name: referrer, domain: null } as {
				name: string;
				domain: string | null;
			};
		}
	}

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
				<div className="h-[89px] border-b">
					<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
						<div className="flex items-center gap-4">
							<Button onClick={handleBack} size="sm" variant="outline">
								<ArrowLeftIcon className="mr-2 h-4 w-4" />
								Back to Users
							</Button>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-3">
									<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
										<UserIcon className="h-5 w-5 text-primary" />
									</div>
									<div className="min-w-0 flex-1">
										<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
											User Details
										</h1>
										<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
											Loading user profile...
										</p>
									</div>
								</div>
							</div>
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
				<div className="h-[89px] border-b">
					<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
						<div className="flex items-center gap-4">
							<Button onClick={handleBack} size="sm" variant="outline">
								<ArrowLeftIcon className="mr-2 h-4 w-4" />
								Back to Users
							</Button>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-3">
									<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
										<UserIcon className="h-5 w-5 text-primary" />
									</div>
									<div className="min-w-0 flex-1">
										<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
											User Details
										</h1>
										<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
											Error loading user profile
										</p>
									</div>
								</div>
							</div>
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
				<div className="h-[89px] border-b">
					<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
						<div className="flex items-center gap-4">
							<Button onClick={handleBack} size="sm" variant="outline">
								<ArrowLeftIcon className="mr-2 h-4 w-4" />
								Back to Users
							</Button>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-3">
									<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
										<UserIcon className="h-5 w-5 text-primary" />
									</div>
									<div className="min-w-0 flex-1">
										<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
											User Details
										</h1>
										<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
											User not found
										</p>
									</div>
								</div>
							</div>
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
			<div className="h-[89px] border-b">
				<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
					<div className="flex items-center gap-4">
						<Button onClick={handleBack} size="sm" variant="outline">
							<ArrowLeftIcon className="mr-2 h-4 w-4" />
							Back to Users
						</Button>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-3">
								<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
									<UserIcon className="h-5 w-5 text-primary" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
											User Details
										</h1>
										<Badge
											className="px-2 py-1 font-semibold text-xs"
											variant={
												userProfile.total_sessions > 1 ? 'default' : 'secondary'
											}
										>
											{userProfile.total_sessions > 1 ? 'Returning' : 'New'}
										</Badge>
									</div>
									<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
										Visitor ID: {userProfile.visitor_id}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="grid grid-cols-1 gap-0 lg:grid-cols-3">
					{/* User Overview */}
					<div className="border-b bg-background lg:sticky lg:top-[89px] lg:h-[calc(100vh-89px)] lg:overflow-auto lg:border-r lg:border-b-0">
						<div className="px-4 py-6">
							<h2 className="mb-4 font-semibold text-foreground text-lg">
								User Overview
							</h2>

							<div className="space-y-6">
								{/* Basic Info */}
								<div className="space-y-4">
									<div className="flex items-center gap-3">
										<CountryFlag country={userProfile.country} size="lg" />
										{getDeviceIcon(userProfile.device)}
										<BrowserIcon name={userProfile.browser} size="md" />
										<OSIcon name={userProfile.os} size="md" />
									</div>

									<div>
										<div className="text-muted-foreground text-sm">
											Location
										</div>
										<div className="font-medium">
											{userProfile.region && userProfile.region !== 'Unknown'
												? `${userProfile.region}, `
												: ''}
											{userProfile.country || 'Unknown'}
										</div>
									</div>

									<div>
										<div className="text-muted-foreground text-sm">
											Device & Browser
										</div>
										<div className="font-medium">
											{userProfile.device} • {userProfile.browser} •{' '}
											{userProfile.os}
										</div>
									</div>
								</div>

								{/* Stats Grid */}
								<div className="grid grid-cols-2 gap-4">
									<div className="rounded-lg border bg-muted/20 p-4 text-center">
										<div className="font-bold text-2xl text-foreground">
											{userProfile.total_sessions}
										</div>
										<div className="text-muted-foreground text-sm">
											Sessions
										</div>
									</div>
									<div className="rounded-lg border bg-muted/20 p-4 text-center">
										<div className="font-bold text-2xl text-foreground">
											{userProfile.total_pageviews}
										</div>
										<div className="text-muted-foreground text-sm">
											Pageviews
										</div>
									</div>
									<div className="rounded-lg border bg-muted/20 p-4 text-center">
										<div className="font-bold text-2xl text-foreground">
											{totalEvents}
										</div>
										<div className="text-muted-foreground text-sm">Events</div>
									</div>
									<div className="rounded-lg border bg-muted/20 p-4 text-center">
										<div className="font-bold text-2xl text-foreground">
											{avgPagesPerSession.toFixed(1)}
										</div>
										<div className="text-muted-foreground text-sm">
											Pages / Session
										</div>
									</div>
								</div>

								{/* Visit Info */}
								<div className="space-y-3">
									<div>
										<div className="text-muted-foreground text-sm">
											First Visit
										</div>
										<div className="font-medium">
											{userProfile.first_visit
												? dayjs(userProfile.first_visit).format(
														'MMM D, YYYY [at] HH:mm'
													)
												: 'Unknown'}
										</div>
									</div>
									<div>
										<div className="text-muted-foreground text-sm">
											Last Visit
										</div>
										<div className="font-medium">
											{userProfile.last_visit
												? dayjs(userProfile.last_visit).format(
														'MMM D, YYYY [at] HH:mm'
													)
												: 'Unknown'}
										</div>
									</div>
									<div>
										<div className="text-muted-foreground text-sm">
											Total Time
										</div>
										<div className="font-medium">
											{userProfile.total_duration_formatted || '0s'}
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* Sessions List */}
					<div className="lg:col-span-2">
						<div className="px-4 py-6">
							<div className="mb-6 flex items-center justify-between">
								<h2 className="font-semibold text-foreground text-lg">
									Sessions ({userProfile.sessions?.length || 0})
								</h2>
							</div>

							{userProfile.sessions && userProfile.sessions.length > 0 ? (
								<div className="space-y-4">
									{userProfile.sessions.map((session: any, index: number) => (
										<div
											className="rounded-lg border bg-muted/10 p-4"
											key={session.session_id}
										>
											<div className="mb-4 flex items-start justify-between">
												<div className="flex items-center gap-3">
													<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-sm">
														{index + 1}
													</div>
													<div>
														<h4 className="font-medium">
															{session.session_name || `Session ${index + 1}`}
														</h4>
														<p className="text-muted-foreground text-sm">
															{session.first_visit
																? dayjs(session.first_visit).format(
																		'MMM D, YYYY [at] HH:mm'
																	)
																: 'Unknown time'}
														</p>
													</div>
												</div>
												<div className="flex gap-6 text-sm">
													<div className="text-center">
														<div className="font-medium">
															{session.duration_formatted || '0s'}
														</div>
														<div className="text-muted-foreground text-xs">
															Duration
														</div>
													</div>
													<div className="text-center">
														<div className="font-medium">
															{session.page_views}
														</div>
														<div className="text-muted-foreground text-xs">
															Pages
														</div>
													</div>
													<div className="text-center">
														<div className="font-medium">
															{session.events?.length || 0}
														</div>
														<div className="text-muted-foreground text-xs">
															Events
														</div>
													</div>
												</div>
											</div>

											{/* Referrer chip */}
											{(session.referrer || session.referrer_parsed) && (
												<div className="mb-3 inline-flex items-center gap-2 rounded border bg-background px-2 py-1 text-xs">
													{(() => {
														const info = getReferrerInfo(session.referrer);
														return info.domain ? (
															<FaviconImage
																className="flex-shrink-0"
																domain={info.domain}
																size={14}
															/>
														) : null;
													})()}
													<span className="text-muted-foreground">
														Referrer:
													</span>
													<span className="font-medium">
														{getReferrerInfo(session.referrer).name}
													</span>
												</div>
											)}

											{/* Event Timeline */}
											{session.events && session.events.length > 0 && (
												<div>
													<h5 className="mb-3 font-medium text-sm">
														Event Timeline ({session.events.length})
													</h5>
													<div className="max-h-64 space-y-2 overflow-y-auto">
														{session.events
															.slice(0, 15)
															.map((event: any, eventIndex: number) => (
																<div
																	className="flex items-center justify-between rounded bg-background p-3 text-xs"
																	key={event.event_id || eventIndex}
																>
																	<div className="flex items-center gap-3">
																		<div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 font-medium text-primary text-xs">
																			{eventIndex + 1}
																		</div>
																		<div className="flex items-center gap-2">
																			<span className="font-medium">
																				{event.event_name}
																			</span>
																			{event.path && (
																				<span className="text-muted-foreground">
																					{event.path}
																				</span>
																			)}
																		</div>
																	</div>
																	<span className="text-muted-foreground">
																		{dayjs(event.time).format('HH:mm:ss')}
																	</span>
																</div>
															))}
														{session.events.length > 15 && (
															<div className="py-2 text-center text-muted-foreground text-xs">
																+{session.events.length - 15} more events
															</div>
														)}
													</div>
												</div>
											)}
										</div>
									))}
								</div>
							) : (
								<div className="py-12 text-center text-muted-foreground">
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
