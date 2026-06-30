"use client";

import { getCountryCode } from "@databuddy/shared/country-codes";
import type { ProfileSession, Session } from "@/types/sessions";
import { notFound, useParams, useRouter } from "next/navigation";
import { type ElementType, type ReactNode, useCallback, useState } from "react";
import { BrowserIcon, CountryFlag, OSIcon } from "@/components/icon";
import { useDateFilters } from "@/hooks/use-date-filters";
import { getDeviceIcon } from "@/components/device-icon";
import { cn } from "@/lib/utils";
import { generateProfileName } from "./_components/generate-profile-name";
import { SessionRow } from "./_components/session-row";
import { useUserProfile } from "./use-user-profile";
import {
	ArrowLeftIcon,
	ChartLineIcon,
	ClockIcon,
	DevicesIcon,
	GaugeIcon,
	GlobeIcon,
	UserIcon,
} from "@databuddy/ui/icons";
import {
	Button,
	EmptyState,
	Spinner,
	StatusDot,
	formatDateOnly,
	formatLocalTime,
} from "@databuddy/ui";

const VITAL_ORDER = ["LCP", "INP", "CLS", "FCP", "TTFB", "FPS"];

interface ProfileWebVital {
	count: number;
	metric_name: string;
	metric_value: number;
	time: string;
}

type VitalStatus = "destructive" | "muted" | "success" | "warning";

function MetricBar({
	className,
	label,
	value,
}: {
	className?: string;
	label: string;
	value: string | number;
}) {
	return (
		<div
			className={cn(
				"flex min-h-10 items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0",
				className
			)}
		>
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="font-semibold text-foreground text-sm tabular-nums">
				{value}
			</span>
		</div>
	);
}

function SectionHeading({
	icon: Icon,
	title,
}: {
	icon: ElementType;
	title: string;
}) {
	return (
		<div className="mb-2 flex min-h-7 items-center gap-2">
			<Icon className="size-4 text-muted-foreground" weight="duotone" />
			<span className="font-semibold text-foreground text-sm">{title}</span>
		</div>
	);
}

function DetailRow({
	indicator,
	label,
	value,
	subValue,
}: {
	indicator: ReactNode;
	label: string;
	value: string | number;
	subValue?: string;
}) {
	return (
		<div className="flex min-h-10 items-center gap-3 py-2.5">
			<div className="flex size-5 shrink-0 items-center justify-center">
				{indicator}
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-muted-foreground text-xs">{label}</p>
				<p className="truncate font-medium text-foreground text-sm">{value}</p>
				{subValue ? (
					<p className="truncate text-muted-foreground/70 text-xs">
						{subValue}
					</p>
				) : null}
			</div>
		</div>
	);
}

function SidebarSection({
	children,
	className,
	icon,
	title,
}: {
	children: ReactNode;
	icon: ElementType;
	title: string;
	className?: string;
}) {
	return (
		<section className={cn("border-b px-4 py-3 last:border-b-0", className)}>
			<SectionHeading icon={icon} title={title} />
			{children}
		</section>
	);
}

function LoadingSkeleton({ onBack }: { onBack: () => void }) {
	return (
		<div className="flex h-full flex-col">
			<Header onBack={onBack} />
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<Spinner className="size-8 text-primary" />
					<span className="text-muted-foreground text-sm">Loading…</span>
				</div>
			</div>
		</div>
	);
}

function UserProfileState({
	description,
	onBack,
	title,
	variant = "minimal",
}: {
	onBack: () => void;
	description: string;
	title: string;
	variant?: "minimal" | "error";
}) {
	return (
		<div className="flex h-full flex-col">
			<Header onBack={onBack} />
			<EmptyState
				action={
					<Button onClick={onBack} variant="secondary">
						<ArrowLeftIcon className="mr-2 size-4" />
						Back to users
					</Button>
				}
				className="min-h-0 flex-1"
				description={description}
				icon={<UserIcon />}
				title={title}
				variant={variant}
			/>
		</div>
	);
}

function toSession(session: ProfileSession, visitorId: string): Session {
	const countryCode = getCountryCode(session.country || "");
	return {
		session_id: session.session_id,
		first_visit: session.first_visit || "",
		last_visit: session.last_visit || "",
		page_views: session.page_views ?? 0,
		visitor_id: visitorId,
		country: countryCode,
		country_name: session.country || "",
		country_code: countryCode,
		referrer: session.referrer || "",
		device_type: session.device || "",
		browser_name: session.browser || "",
		os_name: session.os || "",
		events: session.events || [],
		session_name: session.session_name || undefined,
	};
}

function getVitalRank(metricName: string): number {
	const rank = VITAL_ORDER.indexOf(metricName);
	return rank === -1 ? VITAL_ORDER.length : rank;
}

function getLatestWebVitals(sessions: ProfileSession[]): ProfileWebVital[] {
	const latestByMetric = new Map<string, ProfileWebVital>();

	for (const session of sessions) {
		for (const [metric_name, metric_value, time] of session.web_vitals || []) {
			if (!(metric_name && Number.isFinite(metric_value))) {
				continue;
			}

			const current = latestByMetric.get(metric_name);
			const count = (current?.count ?? 0) + 1;
			if (
				!current ||
				new Date(time).getTime() >= new Date(current.time).getTime()
			) {
				latestByMetric.set(metric_name, {
					count,
					metric_name,
					metric_value,
					time,
				});
			} else {
				current.count = count;
			}
		}
	}

	return [...latestByMetric.values()].sort(
		(a, b) =>
			getVitalRank(a.metric_name) - getVitalRank(b.metric_name) ||
			a.metric_name.localeCompare(b.metric_name)
	);
}

function formatVitalValue({
	metric_name,
	metric_value,
}: ProfileWebVital): string {
	if (metric_name === "CLS") {
		return metric_value.toFixed(3);
	}

	if (metric_name === "FPS") {
		return Math.round(metric_value).toString();
	}

	return `${Math.round(metric_value)} ms`;
}

function upperBoundStatus(
	value: number,
	good: number,
	warning: number
): VitalStatus {
	if (value <= good) {
		return "success";
	}
	return value <= warning ? "warning" : "destructive";
}

function lowerBoundStatus(
	value: number,
	good: number,
	warning: number
): VitalStatus {
	if (value >= good) {
		return "success";
	}
	return value >= warning ? "warning" : "destructive";
}

function getVitalStatus({
	metric_name,
	metric_value,
}: ProfileWebVital): VitalStatus {
	switch (metric_name) {
		case "CLS":
			return upperBoundStatus(metric_value, 0.1, 0.25);
		case "FCP":
			return upperBoundStatus(metric_value, 1800, 3000);
		case "FPS":
			return lowerBoundStatus(metric_value, 55, 30);
		case "INP":
			return upperBoundStatus(metric_value, 200, 500);
		case "LCP":
			return upperBoundStatus(metric_value, 2500, 4000);
		case "TTFB":
			return upperBoundStatus(metric_value, 800, 1800);
		default:
			return "muted";
	}
}

function WebVitalsSection({
	className,
	vitals,
}: {
	className?: string;
	vitals: ProfileWebVital[];
}) {
	if (vitals.length === 0) {
		return null;
	}

	return (
		<SidebarSection className={className} icon={GaugeIcon} title="Web Vitals">
			{vitals.map((vital) => (
				<DetailRow
					indicator={<StatusDot color={getVitalStatus(vital)} size="md" />}
					key={vital.metric_name}
					label={vital.metric_name}
					subValue={`${vital.count} sample${vital.count === 1 ? "" : "s"}`}
					value={formatVitalValue(vital)}
				/>
			))}
		</SidebarSection>
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
	const isReturning = (userProfile?.total_sessions ?? 0) > 1;

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
					<div className="flex items-center gap-1.5 text-xs">
						<StatusDot color={isReturning ? "success" : "muted"} size="sm" />
						<span className="font-medium text-foreground">
							{isReturning ? "Returning" : "New"}
						</span>
					</div>
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
	const params = useParams();
	const websiteId = typeof params.id === "string" ? params.id : "";
	const userId = typeof params.userId === "string" ? params.userId : "";
	const router = useRouter();
	const { dateRange } = useDateFilters();
	const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
		new Set()
	);

	const { userProfile, isLoading, isError, error } = useUserProfile(
		websiteId,
		userId,
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

	const handleBack = useCallback(() => {
		router.push(`/websites/${websiteId}/users`);
	}, [router, websiteId]);

	if (!(websiteId && userId)) {
		notFound();
	}

	if (isLoading) {
		return <LoadingSkeleton onBack={handleBack} />;
	}

	if (isError) {
		return (
			<UserProfileState
				description={error?.message || "Please try again later."}
				onBack={handleBack}
				title="Failed to load user"
				variant="error"
			/>
		);
	}

	if (!userProfile) {
		return (
			<UserProfileState
				description={`User "${userId}" was not found in the selected date range.`}
				onBack={handleBack}
				title="User not found"
			/>
		);
	}

	const sessions = userProfile.sessions ?? [];
	const totalEvents = sessions.reduce(
		(total, session) => total + session.events.length,
		0
	);
	const totalPages = sessions.reduce(
		(total, session) => total + (session.page_views || 0),
		0
	);
	const totalSessions = userProfile.total_sessions ?? 0;
	const avgPagesPerSession = totalSessions > 0 ? totalPages / totalSessions : 0;
	const region =
		userProfile.region && userProfile.region !== "Unknown"
			? userProfile.region
			: undefined;
	const metrics = [
		{ label: "Sessions", value: totalSessions },
		{ label: "Pageviews", value: userProfile.total_pageviews ?? 0 },
		{ label: "Events", value: totalEvents },
		{ label: "Avg Pages", value: avgPagesPerSession.toFixed(1) },
	];
	const webVitals = getLatestWebVitals(sessions);

	return (
		<div className="flex h-full flex-col">
			<Header onBack={handleBack} userProfile={userProfile} />

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<aside className="hidden w-80 shrink-0 overflow-y-auto border-r bg-sidebar lg:block">
					<div className="border-b">
						{metrics.map((metric) => (
							<MetricBar
								key={metric.label}
								label={metric.label}
								value={metric.value}
							/>
						))}
					</div>

					<WebVitalsSection vitals={webVitals} />

					<SidebarSection icon={GlobeIcon} title="Location">
						<DetailRow
							indicator={
								<CountryFlag
									country={getCountryCode(userProfile.country || "")}
									size="sm"
								/>
							}
							label="Country"
							subValue={region}
							value={userProfile.country || "Unknown"}
						/>
					</SidebarSection>

					<SidebarSection icon={DevicesIcon} title="Technology">
						<DetailRow
							indicator={getDeviceIcon(userProfile.device)}
							label="Device"
							value={userProfile.device || "Unknown"}
						/>
						<DetailRow
							indicator={
								<BrowserIcon
									name={userProfile.browser || "Unknown"}
									size="sm"
								/>
							}
							label="Browser"
							value={userProfile.browser || "Unknown"}
						/>
						<DetailRow
							indicator={
								<OSIcon name={userProfile.os || "Unknown"} size="sm" />
							}
							label="Operating System"
							value={userProfile.os || "Unknown"}
						/>
					</SidebarSection>

					<SidebarSection icon={ClockIcon} title="Timeline">
						<DetailRow
							indicator={<StatusDot color="muted" size="md" />}
							label="First Visit"
							subValue={
								userProfile.first_visit
									? formatLocalTime(userProfile.first_visit, "h:mm A")
									: undefined
							}
							value={
								userProfile.first_visit
									? formatDateOnly(userProfile.first_visit)
									: "Unknown"
							}
						/>
						<DetailRow
							indicator={<StatusDot color="muted" size="md" />}
							label="Last Visit"
							subValue={
								userProfile.last_visit
									? formatLocalTime(userProfile.last_visit, "h:mm A")
									: undefined
							}
							value={
								userProfile.last_visit
									? formatDateOnly(userProfile.last_visit)
									: "Unknown"
							}
						/>
						<DetailRow
							indicator={<StatusDot color="success" size="md" />}
							label="Total Time"
							value={userProfile.total_duration_formatted || "0s"}
						/>
					</SidebarSection>
				</aside>

				<main className="min-w-0 flex-1 overflow-y-auto">
					<div className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4 lg:hidden">
						{metrics.map((metric) => (
							<MetricBar
								className="border-b-0 bg-background px-3"
								key={metric.label}
								label={metric.label}
								value={metric.value}
							/>
						))}
					</div>

					<WebVitalsSection
						className="bg-background lg:hidden"
						vitals={webVitals}
					/>

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

					{sessions.length > 0 ? (
						<div className="divide-y">
							{sessions.map((session: ProfileSession, index: number) => (
								<SessionRow
									index={index}
									isExpanded={expandedSessions.has(session.session_id)}
									key={session.session_id}
									onToggle={handleToggleSession}
									session={toSession(session, userId)}
								/>
							))}
						</div>
					) : (
						<EmptyState
							className="min-h-[320px]"
							description="This user has no session data."
							icon={<ChartLineIcon />}
							title="No sessions"
						/>
					)}
				</main>
			</div>
		</div>
	);
}
