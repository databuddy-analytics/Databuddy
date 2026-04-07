"use client";

import {
	ActivityIcon,
	BugIcon,
	TrendUpIcon,
	UsersIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CHART_DATA = [
	{ errors: 45, critical: 8 },
	{ errors: 82, critical: 20 },
	{ errors: 63, critical: 12 },
	{ errors: 128, critical: 36 },
	{ errors: 97, critical: 22 },
	{ errors: 54, critical: 10 },
	{ errors: 38, critical: 6 },
	{ errors: 71, critical: 15 },
	{ errors: 156, critical: 38 },
	{ errors: 112, critical: 27 },
	{ errors: 89, critical: 17 },
	{ errors: 234, critical: 62 },
	{ errors: 178, critical: 45 },
	{ errors: 143, critical: 33 },
	{ errors: 201, critical: 55 },
	{ errors: 167, critical: 41 },
] as const;

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }> }) {
	if (!active || !payload?.length) return null;
	return (
		<div className="rounded border border-border bg-card/90 px-3 py-2 shadow-lg backdrop-blur-sm">
			{payload.map((p) => (
				<div className="flex items-center gap-2" key={p.name}>
					<span className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} />
					<span className="font-mono text-[11px] text-foreground">{p.name}: {p.value}</span>
				</div>
			))}
		</div>
	);
}

function ErrorStatCard({
	title,
	value,
	icon: Icon,
	variant = "default",
}: {
	title: string;
	value: string;
	icon: typeof WarningCircleIcon;
	variant?: "default" | "destructive" | "warning";
}) {
	const styles = {
		default: { iconBg: "bg-accent", iconColor: "text-muted-foreground" },
		destructive: { iconBg: "bg-destructive/10", iconColor: "text-destructive" },
		warning: { iconBg: "bg-amber-500/10", iconColor: "text-amber-600 dark:text-amber-400" },
	}[variant];

	return (
		<Card className="gap-0 overflow-hidden border bg-card py-0">
			<div className="flex items-center gap-2.5 px-2.5 py-2.5">
				<div className={cn("flex size-7 shrink-0 items-center justify-center rounded", styles.iconBg)}>
					<Icon className={cn("size-4", styles.iconColor)} weight="duotone" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-base tabular-nums leading-tight">{value}</p>
					<p className="truncate text-muted-foreground text-xs">{title}</p>
				</div>
			</div>
		</Card>
	);
}

function TopErrorCard() {
	return (
		<div className="flex flex-1 flex-col rounded border bg-card">
			<div className="flex items-center gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3">
				<div className="flex size-8 items-center justify-center rounded bg-destructive/10">
					<BugIcon className="size-4 text-destructive" weight="duotone" />
				</div>
				<div className="min-w-0 flex-1">
					<h3 className="font-semibold text-foreground text-sm">Most Frequent Error</h3>
					<p className="text-muted-foreground text-xs">Top occurring error</p>
				</div>
				<Badge className="shrink-0" variant="destructive">
					<span className="font-mono text-[10px]">CRITICAL</span>
				</Badge>
			</div>

			<div className="flex-1 bg-muted/30 p-3 sm:p-4">
				<p className="line-clamp-2 font-mono text-foreground text-sm leading-relaxed">
					Uncaught Error: Minified React error #418; visit...
				</p>
				<p className="mt-2 font-mono text-[10px] text-muted-foreground">
					Last seen: 2026-04-02 14:37:42.651
				</p>
			</div>

			<div className="grid grid-cols-2 gap-2 border-t bg-accent/30 p-3">
				<div className="flex items-center gap-2 rounded border bg-card p-2">
					<WarningCircleIcon className="size-4 shrink-0 text-destructive" weight="duotone" />
					<div className="min-w-0">
						<div className="font-semibold text-foreground text-sm tabular-nums">7</div>
						<div className="text-[10px] text-muted-foreground">occurrences</div>
					</div>
				</div>
				<div className="flex items-center gap-2 rounded border bg-card p-2">
					<UsersIcon className="size-4 shrink-0 text-chart-2" weight="duotone" />
					<div className="min-w-0">
						<div className="font-semibold text-foreground text-sm tabular-nums">7</div>
						<div className="text-[10px] text-muted-foreground">users affected</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export function ErrorTrackingDemo({ children }: { children?: ReactNode }) {
	return (
		<div className="relative min-h-[calc(100dvh-7rem)] w-full overflow-hidden sm:min-h-[calc(100dvh-8rem)]">
			{/* Chart fills the full container as background */}
			<div className="absolute inset-0">
				<ResponsiveContainer height="100%" width="100%">
					<AreaChart data={[...CHART_DATA]} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
						<defs>
							<linearGradient id="errGold" x1="0" x2="0" y1="0" y2="1">
								<stop offset="0%" stopColor="#E3A512" stopOpacity={0.18} />
								<stop offset="100%" stopColor="#E3A512" stopOpacity={0} />
							</linearGradient>
							<linearGradient id="errRed" x1="0" x2="0" y1="0" y2="1">
								<stop offset="0%" stopColor="#ef4444" stopOpacity={0.12} />
								<stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
							</linearGradient>
						</defs>
						<Tooltip content={<CustomTooltip />} />
						<Area
							activeDot={{ r: 4, fill: "#E3A512" }}
							dataKey="errors"
							dot={false}
							fill="url(#errGold)"
							name="Errors"
							stroke="#E3A512"
							strokeOpacity={0.5}
							strokeWidth={1.5}
							type="monotone"
						/>
						<Area
							activeDot={{ r: 4, fill: "#ef4444" }}
							dataKey="critical"
							dot={false}
							fill="url(#errRed)"
							name="Critical"
							stroke="#ef4444"
							strokeOpacity={0.4}
							strokeWidth={1.5}
							type="monotone"
						/>
					</AreaChart>
				</ResponsiveContainer>
				{/* Fade bottom into background */}
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent" />
				{/* Fade left edge so text is legible */}
				<div className="pointer-events-none absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-background via-background/50 to-transparent" />
			</div>

			{/* Hero copy — top; reserve space so cards don’t cover CTAs on narrow viewports */}
			<div className="pointer-events-none relative z-10 px-0 pt-8 pb-[min(28rem,52vh)] sm:pt-10 sm:pb-16 lg:pt-12 lg:pb-20">
				<div className="pointer-events-auto max-w-2xl">{children}</div>
			</div>

			{/* Demo cards — flush to bottom-right (flex-end) */}
			<div className="pointer-events-auto absolute right-0 bottom-8 z-10 flex w-full flex-col items-end gap-3 px-4 pt-0 pb-4 sm:bottom-10 sm:flex-row sm:items-end sm:justify-end sm:gap-3 sm:px-6 sm:pt-0 sm:pb-5 lg:bottom-12 lg:px-8 lg:pt-0 lg:pb-6">
				<div className="grid w-[min(100%,17.5rem)] shrink-0 grid-cols-2 gap-2 sm:w-[17.5rem]">
					<ErrorStatCard
						icon={WarningCircleIcon}
						title="Total Errors"
						value="1,919"
						variant="destructive"
					/>
					<ErrorStatCard
						icon={TrendUpIcon}
						title="Error Rate"
						value="0.80%"
						variant="warning"
					/>
					<ErrorStatCard icon={UsersIcon} title="Affected Users" value="576" />
					<ErrorStatCard
						icon={ActivityIcon}
						title="Affected Sessions"
						value="847"
					/>
				</div>
				<div className="w-[min(100%,18rem)] min-w-0 sm:w-72">
					<TopErrorCard />
				</div>
			</div>
		</div>
	);
}
