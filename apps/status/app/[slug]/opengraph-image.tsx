// biome-ignore-all lint/a11y: OG image SVGs don't need alt text

import { ImageResponse } from "next/og";
import { rpcClient } from "@/lib/orpc";
import { STATUS_URL } from "@/lib/status-url";

export const revalidate = 60;
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

const THEME = {
	background: "#19191D",
	card: "#1E1E23",
	foreground: "#E7E8EB",
	mutedForeground: "#a3a4ab",
	secondary: "#2A2A31",
	border: "#3b3b45",
} as const;

const STATUS_BANNER: Record<
	string,
	{ bg: string; border: string; text: string; label: string }
> = {
	operational: {
		bg: "rgba(16, 185, 129, 0.1)",
		border: "rgba(16, 185, 129, 0.2)",
		text: "#34d399",
		label: "All Systems Operational",
	},
	degraded: {
		bg: "rgba(245, 158, 11, 0.1)",
		border: "rgba(245, 158, 11, 0.2)",
		text: "#fbbf24",
		label: "Partial System Outage",
	},
	outage: {
		bg: "rgba(239, 68, 68, 0.1)",
		border: "rgba(239, 68, 68, 0.2)",
		text: "#f87171",
		label: "Major System Outage",
	},
	unknown: {
		bg: "rgba(163, 164, 171, 0.1)",
		border: "rgba(163, 164, 171, 0.25)",
		text: "#a3a4ab",
		label: "Status Unavailable",
	},
};

const MONITOR_STATUS_COLORS: Record<string, string> = {
	up: "#10b981",
	degraded: "#f59e0b",
	down: "#ef4444",
	unknown: "#a3a4ab",
};

function getBarColor(uptime: number): string {
	if (uptime >= 99.9) {
		return "#10b981";
	}
	if (uptime >= 99) {
		return "#fcd34d";
	}
	if (uptime >= 97) {
		return "#fbbf24";
	}
	if (uptime >= 95) {
		return "#f59e0b";
	}
	if (uptime >= 90) {
		return "#f97316";
	}
	return "#ef4444";
}

const MAX_MONITORS = 3;
const BAR_DAYS = 90;

export default async function OGImage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const data = await rpcClient.statusPage
		.getBySlug({ slug, days: BAR_DAYS })
		.catch(() => null);

	const pageName = data?.statusPage.name || "Status Page";
	const status = data?.overallStatus ?? "unknown";
	const banner = STATUS_BANNER[status] ?? STATUS_BANNER.unknown;
	const monitors = data?.monitors.slice(0, MAX_MONITORS) ?? [];
	const totalMonitors = data?.monitors.length ?? 0;

	return new ImageResponse(
		<div
			style={{
				height: "100%",
				width: "100%",
				display: "flex",
				flexDirection: "column",
				backgroundColor: THEME.background,
				padding: "48px 56px",
			}}
		>
			<span
				style={{
					color: THEME.foreground,
					fontSize: pageName.length > 30 ? "36px" : "44px",
					fontWeight: 700,
					lineHeight: 1.15,
					letterSpacing: "-0.03em",
					marginBottom: "20px",
				}}
			>
				{pageName}
			</span>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "12px",
					padding: "14px 16px",
					backgroundColor: banner.bg,
					border: `1px solid ${banner.border}`,
					borderRadius: "8px",
					marginBottom: "24px",
					alignSelf: "flex-start",
				}}
			>
				<svg
					height="22"
					viewBox="0 0 24 24"
					width="22"
					xmlns="http://www.w3.org/2000/svg"
				>
					<circle cx="12" cy="12" fill={banner.text} r="12" />
					{status === "operational" && (
						<path
							d="M7 12.5l3 3 7-7"
							fill="none"
							stroke={THEME.background}
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2.5"
						/>
					)}
					{status === "degraded" && (
						<path
							d="M12 7v6M12 16v1"
							fill="none"
							stroke={THEME.background}
							strokeLinecap="round"
							strokeWidth="2.5"
						/>
					)}
					{status === "outage" && (
						<path
							d="M8 8l8 8M16 8l-8 8"
							fill="none"
							stroke={THEME.background}
							strokeLinecap="round"
							strokeWidth="2.5"
						/>
					)}
					{status === "unknown" && (
						<path
							d="M12 7v6M12 16v1"
							fill="none"
							stroke={THEME.background}
							strokeLinecap="round"
							strokeWidth="2.5"
						/>
					)}
				</svg>
				<span style={{ color: banner.text, fontSize: "16px", fontWeight: 600 }}>
					{banner.label}
				</span>
			</div>

			{monitors.length > 0 && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "16px",
						flex: 1,
					}}
				>
					<span
						style={{
							color: THEME.mutedForeground,
							fontSize: "13px",
							fontWeight: 500,
						}}
					>
						Last {BAR_DAYS} days
					</span>
					{monitors.map((monitor) => {
						const monitorStatus = monitor.currentStatus as string;
						const statusColor =
							MONITOR_STATUS_COLORS[monitorStatus] ?? THEME.mutedForeground;
						const barDays = monitor.dailyData.slice(-BAR_DAYS);

						return (
							<div
								key={monitor.id}
								style={{
									display: "flex",
									flexDirection: "column",
									gap: "8px",
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: "10px",
										}}
									>
										<svg
											height="18"
											viewBox="0 0 24 24"
											width="18"
											xmlns="http://www.w3.org/2000/svg"
										>
											<circle cx="12" cy="12" fill={statusColor} r="12" />
											{monitorStatus === "down" ? (
												<path
													d="M8 8l8 8M16 8l-8 8"
													fill="none"
													stroke={THEME.background}
													strokeLinecap="round"
													strokeWidth="2.5"
												/>
											) : monitorStatus === "up" ? (
												<path
													d="M7 12.5l3 3 7-7"
													fill="none"
													stroke={THEME.background}
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth="2.5"
												/>
											) : (
												<path
													d="M12 7v6M12 16v1"
													fill="none"
													stroke={THEME.background}
													strokeLinecap="round"
													strokeWidth="2.5"
												/>
											)}
										</svg>
										<div style={{ display: "flex", flexDirection: "column" }}>
											<span
												style={{
													color: THEME.foreground,
													fontSize: "15px",
													fontWeight: 500,
												}}
											>
												{monitor.name}
											</span>
											<span
												style={{
													color: THEME.mutedForeground,
													fontSize: "12px",
												}}
											>
												{monitor.domain}
											</span>
										</div>
									</div>
									<span
										style={{
											color: THEME.foreground,
											fontSize: "15px",
											fontWeight: 500,
											fontFamily: "monospace",
										}}
									>
										{monitor.uptimePercentage == null
											? "No uptime data"
											: `${monitor.uptimePercentage.toFixed(2)}%`}
									</span>
								</div>

								<div style={{ display: "flex", gap: "2px", height: "28px" }}>
									{barDays.map((day) => (
										<div
											key={day.date}
											style={{
												flex: 1,
												backgroundColor:
													day.uptime_percentage == null
														? THEME.secondary
														: getBarColor(day.uptime_percentage),
												borderRadius: "2px",
											}}
										/>
									))}
									{Array.from({
										length: Math.max(0, BAR_DAYS - barDays.length),
									}).map((_, i) => (
										<div
											key={`empty-${i}`}
											style={{
												flex: 1,
												backgroundColor: THEME.secondary,
												borderRadius: "2px",
											}}
										/>
									))}
								</div>
							</div>
						);
					})}

					{totalMonitors > MAX_MONITORS && (
						<span
							style={{
								color: THEME.mutedForeground,
								fontSize: "14px",
								marginTop: "2px",
							}}
						>
							+{totalMonitors - MAX_MONITORS} more service
							{totalMonitors - MAX_MONITORS > 1 ? "s" : ""}
						</span>
					)}
				</div>
			)}

			<div
				style={{
					position: "absolute",
					bottom: "48px",
					right: "56px",
					display: "flex",
					alignItems: "center",
				}}
			>
				<span
					style={{
						color: THEME.mutedForeground,
						fontSize: "16px",
						fontFamily: "monospace",
					}}
				>
					{new URL(STATUS_URL).host}/{slug}
				</span>
			</div>
		</div>,
		{ ...size }
	);
}
