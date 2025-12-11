"use client";

import { getCountryCode } from "@databuddy/shared/country-codes";
import type { Session } from "@databuddy/shared/types/sessions";
import {
	ArrowLeftIcon,
	ChartLineIcon,
	ClockIcon,
	CursorClickIcon,
	DevicesIcon,
	EyeIcon,
	GlobeIcon,
	SpinnerIcon,
	UserIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { BrowserIcon, CountryFlag, OSIcon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useUserProfile } from "@/hooks/use-dynamic-query";
import { getDeviceIcon } from "@/lib/utils";
import { generateProfileName } from "./_components/generate-profile-name";
import { SessionRow } from "./_components/session-row";

function StatItem({
	icon: Icon,
	label,
	value,
	subValue,
}: {
	icon: React.ElementType;
	label: string;
	value: string | number;
	subValue?: string;
}) {
	return (
		<div className="flex items-center gap-3">
			<div className="flex size-9 shrink-0 items-center justify-center rounded bg-primary/10">
				<Icon className="size-4 text-primary" weight="duotone" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-semibold text-foreground text-lg tabular-nums leading-tight">
					{value}
				</p>
				<p className="text-muted-foreground text-xs">{label}</p>
				{subValue && (
					<p className="text-muted-foreground/70 text-xs">{subValue}</p>
				)}
			</div>
		</div>
	);
}

function TechItem({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center gap-3 rounded bg-accent/50 px-3 py-2.5">
			<div className="shrink-0">{icon}</div>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-foreground text-sm">{value}</p>
				<p className="text-muted-foreground text-xs">{label}</p>
			</div>
		</div>
	);
}

function TimelineItem({
	label,
	date,
	time,
}: {
	label: string;
	date: string;
	time?: string;
}) {
	return (
		<div className="flex items-start gap-3">
			<div className="mt-0.5 size-2 shrink-0 rounded-full bg-primary/60" />
			<div className="min-w-0 flex-1">
				<p className="text-muted-foreground text-xs">{label}</p>
				<p className="font-medium text-foreground text-sm">{date}</p>
				{time && <p className="text-muted-foreground/70 text-xs">{time}</p>}
			</div>
		</div>
	);
}

function LoadingSkeleton({ onBack }: { onBack: () => void }) {
	return (
		<div className="flex h-full flex-col">
			<Header onBack={onBack} />
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<SpinnerIcon className="size-8 animate-spin text-primary" />
					<span className="text-muted-foreground text-sm">
						Loading user profile...
					</span>
				</div>
			</div>
		</div>
	);
}

function ErrorState({
	onBack,
	message,
}: {
	onBack: () => void;
	message?: string;
}) {
	return (
		<div className="flex h-full flex-col">
			<Header onBack={onBack} />
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
				<div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
					<UserIcon className="size-8 text-destructive" weight="duotone" />
				</div>
				<div className="text-center">
					<p className="font-semibold text-foreground text-lg">
						Failed to load user
					</p>
					<p className="mt-1 text-muted-foreground text-sm">
						{message || "Please try again later"}
					</p>
				</div>
				<Button onClick={onBack} variant="outline">
					<ArrowLeftIcon className="mr-2 size-4" />
					Back to Users
				</Button>
			</div>
		</div>
	);
}

function NotFoundState({
	onBack,
	userId,
}: {
	onBack: () => void;
	userId: string;
}) {
	return (
		<div className="flex h-full flex-col">
			<Header onBack={onBack} />
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
				<div className="flex size-16 items-center justify-center rounded-full bg-secondary">
					<UserIcon
						className="size-8 text-secondary-foreground"
						weight="duotone"
					/>
				</div>
				<div className="text-center">
					<p className="font-semibold text-foreground text-lg">
						User not found
					</p>
					<p className="mt-1 text-muted-foreground text-sm">
						User "{userId}" was not found in the selected date range.
					</p>
				</div>
				<Button onClick={onBack} variant="outline">
					<ArrowLeftIcon className="mr-2 size-4" />
					Back to Users
				</Button>
			</div>
		</div>
	);
}

function Header({
	onBack,
	userProfile,
}: {
	onBack: () => void;
	userProfile?: {
		visitor_id: string;
		country?: string;
		region?: string;
		total_sessions: number;
	};
}) {
	const countryCode = userProfile
		? getCountryCode(userProfile.country || "")
		: "";

	return (
		<div className="flex h-12 shrink-0 items-center border-b bg-background">
			<Button
				className="h-full w-12 shrink-0 rounded-none border-r"
				onClick={onBack}
				size="icon"
				variant="ghost"
			>
				<ArrowLeftIcon className="size-4" />
			</Button>

			{userProfile ? (
				<div className="flex flex-1 items-center justify-between px-3">
					<div className="flex items-center gap-2.5">
						<CountryFlag country={countryCode} size="sm" />
						<div>
							<h1 className="font-medium text-foreground text-sm">
								{generateProfileName(userProfile.visitor_id)}
							</h1>
							<p className="text-muted-foreground text-xs">
								{userProfile.region && userProfile.region !== "Unknown"
									? `${userProfile.region}, `
									: ""}
								{userProfile.country || "Unknown location"}
							</p>
						</div>
					</div>
					<Badge
						variant={
							(userProfile.total_sessions ?? 0) > 1 ? "default" : "secondary"
						}
					>
						{(userProfile.total_sessions ?? 0) > 1 ? "Return" : "New"}
					</Badge>
				</div>
			) : (
				<div className="flex flex-1 items-center gap-2.5 px-3">
					<div className="size-4 animate-pulse rounded bg-muted" />
					<div className="space-y-1">
						<div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
						<div className="h-3 w-20 animate-pulse rounded bg-muted" />
					</div>
				</div>
			)}
		</div>
	);
}

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

	const transformSession = useCallback(
		(session: {
			session_id: string;
			first_visit?: string | null;
			last_visit?: string | null;
			page_views?: number | null;
			country?: string | null;
			referrer?: string | null;
			device?: string | null;
			browser?: string | null;
			os?: string | null;
			events?: unknown[] | null;
			session_name?: string | null;
		}): Session => {
			const countryCode = getCountryCode(session.country || "");
			return {
				session_id: session.session_id,
				first_visit: session.first_visit || "",
				last_visit: session.last_visit || "",
				page_views: session.page_views ?? 0,
				visitor_id: userId as string,
				country: countryCode,
				country_name: session.country || "",
				country_code: countryCode,
				referrer: session.referrer || "",
				device_type: session.device || "",
				browser_name: session.browser || "",
				os_name: session.os || "",
				events: session.events || [],
				session_name: session.session_name || undefined,
			} as Session;
		},
		[userId]
	);

	const handleBack = () => {
		router.push(`/websites/${websiteId}/users`);
	};

	if (isLoading) {
		return <LoadingSkeleton onBack={handleBack} />;
	}

	if (isError) {
		return <ErrorState message={error?.message} onBack={handleBack} />;
	}

	if (!userProfile) {
		return <NotFoundState onBack={handleBack} userId={userId as string} />;
	}

	// Calculate stats
	const totalEvents =
		userProfile.sessions?.reduce(
			(acc: number, s: { events?: unknown[] }) =>
				acc + (Array.isArray(s.events) ? s.events.length : 0),
			0
		) ?? 0;
	const totalPages =
		userProfile.sessions?.reduce(
			(acc: number, s: { page_views?: number }) =>
				acc + (Number(s.page_views) || 0),
			0
		) ?? 0;
	const totalSessions = userProfile.total_sessions ?? 0;
	const avgPagesPerSession = totalSessions > 0 ? totalPages / totalSessions : 0;

	return (
		<div className="flex h-full flex-col">
			<Header onBack={handleBack} userProfile={userProfile} />

			<div className="flex min-h-0 flex-1 overflow-hidden">
				{/* Sidebar - User Overview */}
				<aside className="hidden w-80 shrink-0 overflow-y-auto border-r bg-sidebar lg:block">
					{/* Stats Grid */}
					<div className="grid grid-cols-2 gap-px border-b bg-border">
						<div className="bg-sidebar p-4">
							<StatItem
								icon={ChartLineIcon}
								label="Sessions"
								value={userProfile.total_sessions ?? 0}
							/>
						</div>
						<div className="bg-sidebar p-4">
							<StatItem
								icon={EyeIcon}
								label="Pageviews"
								value={userProfile.total_pageviews ?? 0}
							/>
						</div>
						<div className="bg-sidebar p-4">
							<StatItem
								icon={CursorClickIcon}
								label="Events"
								value={totalEvents}
							/>
						</div>
						<div className="bg-sidebar p-4">
							<StatItem
								icon={ChartLineIcon}
								label="Avg Pages"
								value={avgPagesPerSession.toFixed(1)}
							/>
						</div>
					</div>

					{/* Location */}
					<div className="border-b p-4">
						<div className="mb-3 flex items-center gap-2">
							<GlobeIcon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
							<span className="font-semibold text-foreground text-sm">
								Location
							</span>
						</div>
						<div className="flex items-center gap-3 rounded bg-accent/50 px-3 py-2.5">
							<CountryFlag
								country={getCountryCode(userProfile.country || "")}
								size="lg"
							/>
							<div>
								<p className="font-medium text-foreground">
									{userProfile.country || "Unknown"}
								</p>
								{userProfile.region && userProfile.region !== "Unknown" && (
									<p className="text-muted-foreground text-xs">
										{userProfile.region}
									</p>
								)}
							</div>
						</div>
					</div>

					{/* Technology */}
					<div className="border-b p-4">
						<div className="mb-3 flex items-center gap-2">
							<DevicesIcon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
							<span className="font-semibold text-foreground text-sm">
								Technology
							</span>
						</div>
						<div className="space-y-2">
							<TechItem
								icon={getDeviceIcon(userProfile.device)}
								label="Device"
								value={userProfile.device || "Unknown"}
							/>
							<TechItem
								icon={
									<BrowserIcon
										name={userProfile.browser || "Unknown"}
										size="md"
									/>
								}
								label="Browser"
								value={userProfile.browser || "Unknown"}
							/>
							<TechItem
								icon={<OSIcon name={userProfile.os || "Unknown"} size="md" />}
								label="Operating System"
								value={userProfile.os || "Unknown"}
							/>
						</div>
					</div>

					{/* Timeline */}
					<div className="p-4">
						<div className="mb-3 flex items-center gap-2">
							<ClockIcon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
							<span className="font-semibold text-foreground text-sm">
								Timeline
							</span>
						</div>
						<div className="space-y-4">
							<TimelineItem
								date={
									userProfile.first_visit
										? dayjs(userProfile.first_visit).format("MMM D, YYYY")
										: "Unknown"
								}
								label="First Visit"
								time={
									userProfile.first_visit
										? dayjs(userProfile.first_visit).format("h:mm A")
										: undefined
								}
							/>
							<TimelineItem
								date={
									userProfile.last_visit
										? dayjs(userProfile.last_visit).format("MMM D, YYYY")
										: "Unknown"
								}
								label="Last Visit"
								time={
									userProfile.last_visit
										? dayjs(userProfile.last_visit).format("h:mm A")
										: undefined
								}
							/>
							<div className="flex items-start gap-3">
								<div className="mt-0.5 size-2 shrink-0 rounded-full bg-success" />
								<div className="min-w-0 flex-1">
									<p className="text-muted-foreground text-xs">Total Time</p>
									<p className="font-semibold text-foreground">
										{userProfile.total_duration_formatted || "0s"}
									</p>
								</div>
							</div>
						</div>
					</div>
				</aside>

				{/* Main Content - Sessions */}
				<main className="min-w-0 flex-1 overflow-y-auto">
					{/* Mobile Stats (visible on small screens) */}
					<div className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4 lg:hidden">
						<div className="bg-background p-3">
							<p className="font-bold text-foreground text-xl tabular-nums">
								{userProfile.total_sessions ?? 0}
							</p>
							<p className="text-muted-foreground text-xs">Sessions</p>
						</div>
						<div className="bg-background p-3">
							<p className="font-bold text-foreground text-xl tabular-nums">
								{userProfile.total_pageviews ?? 0}
							</p>
							<p className="text-muted-foreground text-xs">Pageviews</p>
						</div>
						<div className="bg-background p-3">
							<p className="font-bold text-foreground text-xl tabular-nums">
								{totalEvents}
							</p>
							<p className="text-muted-foreground text-xs">Events</p>
						</div>
						<div className="bg-background p-3">
							<p className="font-bold text-foreground text-xl tabular-nums">
								{avgPagesPerSession.toFixed(1)}
							</p>
							<p className="text-muted-foreground text-xs">Avg Pages</p>
						</div>
					</div>

					{/* Sessions Header */}
					<div className="sticky top-0 z-10 grid h-[39px] grid-cols-[24px_1fr_120px_80px_60px_60px_70px_80px] items-center gap-2 border-b bg-accent px-3 font-medium text-muted-foreground text-xs shadow-[0_0_0_0.5px_var(--border)] lg:grid-cols-[24px_1fr_120px_80px_100px_60px_60px_70px_80px]">
						<div />
						<span>Session</span>
						<span>Location</span>
						<span>Device</span>
						<span className="hidden lg:block">Source</span>
						<span className="text-right">Pages</span>
						<span className="text-right">Events</span>
						<span className="text-right">Last seen</span>
					</div>

					{/* Sessions List */}
					{userProfile.sessions && userProfile.sessions.length > 0 ? (
						<div className="divide-y">
							{userProfile.sessions.map(
								(
									session: {
										session_id: string;
										first_visit: string;
										last_visit: string;
										page_views: number;
										country?: string;
										referrer?: string;
										device?: string;
										browser?: string;
										os?: string;
										events?: unknown[];
										session_name?: string;
									},
									index: number
								) => (
									<SessionRow
										index={index}
										isExpanded={expandedSessions.has(session.session_id)}
										key={session.session_id}
										onToggle={handleToggleSession}
										session={transformSession(session)}
									/>
								)
							)}
						</div>
					) : (
						<div className="flex flex-col items-center justify-center py-16">
							<div className="flex size-12 items-center justify-center rounded-full bg-secondary">
								<ChartLineIcon
									className="size-6 text-secondary-foreground"
									weight="duotone"
								/>
							</div>
							<p className="mt-4 font-medium text-foreground">
								No sessions found
							</p>
							<p className="mt-1 text-muted-foreground text-sm">
								No session data available for this user
							</p>
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
