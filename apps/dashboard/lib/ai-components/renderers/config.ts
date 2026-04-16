import { chartSeriesColorAtIndex } from "@/lib/chart-presentation";

/**
 * Get a theme-aware chart color by index.
 * Uses the dashboard's CSS variable palette for consistency.
 */
export const getChartColor = chartSeriesColorAtIndex;
