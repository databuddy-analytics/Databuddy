import dayjs from "../dayjs";

export interface UptimeHeatmapDay {
	avgResponseTime: number | null;
	date: Date;
	dateStr: string;
	downtimeSeconds: number;
	hasData: boolean;
	p95ResponseTime: number | null;
	successfulChecks: number;
	totalChecks: number;
	uptime: number;
}

export function buildUptimeHeatmapDays(
	data: Array<{
		avg_response_time?: number;
		date: string;
		p95_response_time?: number;
		uptime_percentage?: number;
		total_checks?: number;
		successful_checks?: number;
		downtime_seconds?: number;
	}>,
	days: number
): UptimeHeatmapDay[] {
	const dataByDate = new Map(data.map((d) => [d.date.slice(0, 10), d]));

	const result: UptimeHeatmapDay[] = [];
	const today = dayjs.utc().startOf("day");

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
			avgResponseTime: dayData?.avg_response_time ?? null,
			p95ResponseTime: dayData?.p95_response_time ?? null,
		});
	}
	return result;
}
