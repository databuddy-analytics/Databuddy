import type { ChartConfig } from "@/components/ui/chart";

export const CHART_COLORS = [
	"#3b82f6", // blue-500
	"#10b981", // green-500
	"#f59e0b", // amber-500
	"#ef4444", // red-500
	"#8b5cf6", // violet-500
	"#06b6d4", // cyan-500
	"#ec4899", // pink-500
	"#f97316", // orange-500
];

/**
 * Build chart config from series keys
 */
export function buildChartConfig(keys: string[]): ChartConfig {
	const config: ChartConfig = {};
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		config[key] = {
			label: key.charAt(0).toUpperCase() + key.slice(1),
			color: CHART_COLORS[i % CHART_COLORS.length],
		};
	}
	return config;
}
