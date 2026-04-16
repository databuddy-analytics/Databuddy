import { localDayjs } from "@/lib/time";

export interface UptimeHeatmapDay {
	date: Date;
	dateStr: string;
	downtimeSeconds: number;
	hasData: boolean;
	successfulChecks: number;
	totalChecks: number;
	uptime: number;
}

export function buildUptimeHeatmapDays(
	data: Array<{
		date: string;
		uptime_percentage?: number;
		total_checks?: number;
		successful_checks?: number;
		downtime_seconds?: number;
	}>,
	days: number
): UptimeHeatmapDay[] {
	const dataByDate = new Map(data.map((d) => [d.date.slice(0, 10), d]));

	const result: UptimeHeatmapDay[] = [];
	const today = localDayjs().endOf("day");

	for (let i = days - 1; i >= 0; i--) {
		const date = today.subtract(i, "day");
		const dateStr = date.format("YYYY-MM-DD");
		const dayData = dataByDate.get(dateStr);

		result.push({
			date: date.toDate(),
			dateStr,
			hasData: !!dayData,
			uptime: dayData?.uptime_percentage ?? 0,
			totalChecks: dayData?.total_checks ?? 0,
			successfulChecks: dayData?.successful_checks ?? 0,
			downtimeSeconds: dayData?.downtime_seconds ?? 0,
		});
	}
	return result;
}
