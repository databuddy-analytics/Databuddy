"use client";

import { BugIcon } from "@phosphor-icons/react/dist/ssr/Bug";
import { EyeIcon } from "@phosphor-icons/react/dist/ssr/Eye";
import { GaugeIcon } from "@phosphor-icons/react/dist/ssr/Gauge";
import { MouseSimpleIcon } from "@phosphor-icons/react/dist/ssr/MouseSimple";
import { TrendDownIcon } from "@phosphor-icons/react/dist/ssr/TrendDown";
import { useAtomValue } from "jotai";
import type { ElementType } from "react";
import { StatCard } from "@/components/analytics/stat-card";
import { formatNumber } from "@/lib/formatters";
import { useOrgSummary } from "../hooks/use-org-summary";
import { insightsRangeAtom } from "../lib/time-range";

type KpiKey = "visitors" | "sessions" | "bounce" | "errors" | "lcp";

interface KpiCardConfig {
	formatValue: (value: number) => string;
	icon: ElementType;
	invertTrend: boolean;
	key: KpiKey;
	title: string;
}

const KPI_CARDS: KpiCardConfig[] = [
	{
		key: "visitors",
		title: "Visitors",
		icon: EyeIcon,
		invertTrend: false,
		formatValue: formatNumber,
	},
	{
		key: "sessions",
		title: "Sessions",
		icon: MouseSimpleIcon,
		invertTrend: false,
		formatValue: formatNumber,
	},
	{
		key: "bounce",
		title: "Bounce rate",
		icon: TrendDownIcon,
		invertTrend: true,
		formatValue: (v) => `${v.toFixed(1)}%`,
	},
	{
		key: "errors",
		title: "Errors",
		icon: BugIcon,
		invertTrend: true,
		formatValue: formatNumber,
	},
	{
		key: "lcp",
		title: "LCP p75",
		icon: GaugeIcon,
		invertTrend: true,
		formatValue: (v) => `${(v / 1000).toFixed(2)}s`,
	},
];

export function KpiRow() {
	const range = useAtomValue(insightsRangeAtom);
	const { data, isLoading } = useOrgSummary(range);
	const kpis = data?.kpis;

	return (
		<section
			aria-label="Key metrics"
			className="grid grid-cols-2 gap-3 border-b px-4 py-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-5"
		>
			{KPI_CARDS.map((card) => {
				const k = kpis?.[card.key];
				return (
					<StatCard
						chartData={k?.sparkline}
						formatValue={card.formatValue}
						icon={card.icon}
						id={`kpi-${card.key}`}
						invertTrend={card.invertTrend}
						isLoading={isLoading}
						key={card.key}
						showChart
						title={card.title}
						trend={k?.change}
						value={k ? card.formatValue(k.current) : "0"}
					/>
				);
			})}
		</section>
	);
}
