import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
export const chartSurfaceClassName =
	"flex w-full min-w-0 flex-col gap-0 overflow-hidden rounded border border-border bg-card";
export const chartSurfaceBorderlessClassName =
	"w-full min-w-0 flex flex-col gap-0 overflow-hidden rounded border-0 bg-card";
export const chartPlotRegionClassName = "dotted-bg bg-accent";
export const chartAxisYWidthDefault = 45;
export const chartAxisYWidthCompact = 32;
export const chartRechartsLegendIconSize = 8;
export const chartRechartsLegendInteractiveWrapperStyle = {
	cursor: "pointer",
	display: "flex",
	fontSize: "12px",
	gap: 12,
	justifyContent: "center",
	lineHeight: 1.2,
	paddingTop: "20px",
} as const satisfies CSSProperties;
export const chartRechartsLegendStaticWrapperStyle = {
	display: "flex",
	fontSize: "12px",
	gap: 12,
	justifyContent: "center",
	lineHeight: 1.2,
	paddingTop: "16px",
} as const satisfies CSSProperties;

export function chartRechartsInteractiveLegendLabelClassName(
	isHidden: boolean
): string {
	return cn(
		"cursor-pointer text-pretty text-xs",
		isHidden
			? "text-muted-foreground line-through opacity-50"
			: "text-muted-foreground hover:text-foreground"
	);
}

export const chartRechartsLegendStaticLabelClassName =
	"text-pretty text-muted-foreground text-xs";
export const chartLegendPillRowClassName =
	"flex shrink-0 flex-wrap justify-end gap-1.5";

export const chartLegendPillClassName =
	"flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5";

export const chartLegendPillDotClassName = "size-2 shrink-0 rounded-full";

export const chartLegendPillLabelClassName =
	"text-muted-foreground text-xs leading-none";
export const chartLegendInlineRowClassName =
	"flex flex-wrap items-center gap-x-4 gap-y-1";

export const chartLegendInlineItemClassName = "flex items-center gap-2";
export const chartAxisTickDefault = {
	fontSize: 11,
	fill: "var(--muted-foreground)",
} as const;
export const chartCartesianGridDefault = {
	stroke: "var(--border)",
	strokeDasharray: "2 4",
	strokeOpacity: 0.35,
	vertical: false,
} as const;
export const chartSeriesPalette = [
	"var(--color-chart-1)",
	"var(--color-chart-2)",
	"var(--color-chart-3)",
	"var(--color-chart-4)",
	"var(--color-chart-5)",
] as const;

export function chartSeriesColorAtIndex(index: number): string {
	return chartSeriesPalette[index % chartSeriesPalette.length];
}
export const chartTooltipMultiShellClassName =
	"min-w-[180px] rounded border border-border bg-popover p-2.5 shadow-lg";
export const chartTooltipSingleShellClassName =
	"rounded border border-border bg-popover px-2.5 py-1.5 shadow-lg";
export const chartTooltipHeaderRowClassName =
	"mb-2 flex items-center gap-2 border-b border-border pb-2";
export function chartTooltipCustomSurfaceClassName(className?: string) {
	return cn(chartTooltipMultiShellClassName, "p-3", className);
}
export function chartRechartsLegendStaticWrapperStyleMerge(
	extra: CSSProperties
): CSSProperties {
	return { ...chartRechartsLegendStaticWrapperStyle, ...extra };
}
