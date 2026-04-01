import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getStatusPageUrl } from "@/lib/app-url";
import { publicRPCClient } from "@/lib/orpc-public";
import { IncidentTimeline } from "./_components/incident-timeline";
import { LastUpdated } from "./_components/last-updated";
import { PasswordGate } from "./_components/password-gate";
import { SectionGroup } from "./_components/section-group";
import { StatusBanner } from "./_components/status-banner";
import { StatusMonitorRow } from "./_components/status-monitor-row";
import { TimeRangeSelector } from "./_components/time-range-selector";

export const revalidate = 60;

type StatusPageData = Awaited<
	ReturnType<typeof publicRPCClient.statusPage.getPublic>
>;

interface StatusPageProps {
	params: Promise<{ slug: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const getStatusData = unstable_cache(
	async (
		slug: string,
		days: number,
		password?: string
	): Promise<StatusPageData | null> =>
		publicRPCClient.statusPage
			.getPublic({ slug, days, password })
			.catch(() => null),
	["status-page-v2"],
	{ revalidate: 60, tags: ["status-page"] }
);

function parseDays(raw: string | string[] | undefined): number {
	const n = Number(typeof raw === "string" ? raw : "90");
	if (n === 7 || n === 30) {
		return n;
	}
	return 90;
}

export async function generateMetadata({
	params,
}: StatusPageProps): Promise<Metadata> {
	const { slug } = await params;
	const data = await getStatusData(slug, 90);

	if (!data) {
		return {
			title: "Status Page",
			description: "System status and uptime monitoring",
		};
	}

	const title = data.page.title || `${data.organization.name} Status`;
	const description =
		data.page.description ??
		`Real-time system status for ${data.organization.name}`;
	const url = getStatusPageUrl(slug);

	return {
		title,
		description,
		alternates: {
			canonical: `/status/${slug}`,
		},
		openGraph: {
			title,
			description,
			url,
			type: "website",
			siteName: data.organization.name,
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
		},
	};
}

export default async function StatusPage({
	params,
	searchParams,
}: StatusPageProps) {
	const { slug } = await params;
	const sp = await searchParams;
	const days = parseDays(sp.days);
	const password = typeof sp.password === "string" ? sp.password : undefined;
	const data = await getStatusData(slug, days, password);

	if (!data) {
		notFound();
	}

	const isPasswordLocked =
		data.page.isPasswordProtected && data.monitors.length === 0 && !password;

	if (isPasswordLocked) {
		return (
			<PasswordGate
				orgName={data.organization.name}
				slug={slug}
				title={data.page.title}
			/>
		);
	}

	const latestTimestamp = data.monitors.reduce<string | null>(
		(latest, monitor) => {
			if (!monitor.lastCheckedAt) {
				return latest;
			}
			if (!latest || monitor.lastCheckedAt > latest) {
				return monitor.lastCheckedAt;
			}
			return latest;
		},
		null
	);

	const accentStyle = data.page.accentColor
		? ({ "--status-accent": data.page.accentColor } as React.CSSProperties)
		: undefined;

	const ungroupedMonitors = data.monitors
		.filter((m) => !m.sectionId)
		.sort((a, b) => a.sortOrder - b.sortOrder);

	const sortedSections = [...data.sections].sort(
		(a, b) => a.sortOrder - b.sortOrder
	);

	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: data.page.title || `${data.organization.name} Status`,
		description:
			data.page.description ??
			`Real-time system status for ${data.organization.name}`,
		url: getStatusPageUrl(slug),
		publisher: {
			"@type": "Organization",
			name: data.organization.name,
			...(data.organization.logo ? { logo: data.organization.logo } : {}),
		},
	};

	return (
		<>
			<script
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
				type="application/ld+json"
			/>
			<div className="space-y-6" style={accentStyle}>
				<div className="flex items-center gap-3.5">
					{data.page.logoUrl || data.organization.logo ? (
						<img
							alt={data.organization.name}
							className="size-10 rounded object-contain"
							height={40}
							src={data.page.logoUrl ?? data.organization.logo ?? ""}
							width={40}
						/>
					) : null}
					<div>
						<h1 className="text-balance font-semibold text-2xl tracking-tight">
							{data.page.title || data.organization.name}
						</h1>
						{data.page.description ? (
							<p className="mt-0.5 text-pretty text-muted-foreground text-sm">
								{data.page.description}
							</p>
						) : (
							<p className="mt-0.5 text-pretty text-muted-foreground text-sm">
								System status and uptime
							</p>
						)}
					</div>
				</div>

				{data.page.showOverallUptime ? (
					<StatusBanner overallStatus={data.overallStatus} />
				) : null}

				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-sm">Monitors</h2>
					<Suspense>
						<TimeRangeSelector currentDays={days} />
					</Suspense>
				</div>

				{ungroupedMonitors.length > 0 ? (
					<div className="space-y-3">
						{ungroupedMonitors.map((monitor) => (
							<StatusMonitorRow
								days={days}
								key={monitor.id}
								monitor={monitor}
							/>
						))}
					</div>
				) : null}

				{sortedSections.map((section) => {
					const sectionMonitors = data.monitors
						.filter((m) => m.sectionId === section.id)
						.sort((a, b) => a.sortOrder - b.sortOrder);

					if (sectionMonitors.length === 0) {
						return null;
					}

					return (
						<SectionGroup
							isCollapsed={section.isCollapsed}
							key={section.id}
							name={section.name}
						>
							{sectionMonitors.map((monitor) => (
								<StatusMonitorRow
									days={days}
									key={monitor.id}
									monitor={monitor}
								/>
							))}
						</SectionGroup>
					);
				})}

				<IncidentTimeline />

				<LastUpdated timestamp={latestTimestamp} />
			</div>
		</>
	);
}
