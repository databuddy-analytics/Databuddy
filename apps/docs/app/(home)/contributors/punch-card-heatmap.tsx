'use client';

import { useMemo, useState } from 'react';

interface ProcessedPunchCard {
	day: number;
	hour: number;
	commits: number;
	dayName: string;
}

interface Props {
	data: ProcessedPunchCard[];
}

interface HeatmapCell {
	day: number;
	hour: number;
	commits: number;
	intensity: number;
	dayName: string;
}

interface TooltipData {
	cell: HeatmapCell;
	x: number;
	y: number;
}

function CustomTooltip({
	data,
	x,
	y,
	formatHour,
}: {
	data: HeatmapCell;
	x: number;
	y: number;
	formatHour: (hour: number) => string;
}) {
	// Adjust tooltip position for mobile to prevent overflow
	const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
	const tooltipX = isMobile
		? Math.min(x + 10, window.innerWidth - 200)
		: x + 10;
	const tooltipY = isMobile ? Math.max(y - 60, 10) : y - 10;

	return (
		<div
			className="pointer-events-none fixed z-50 min-w-[160px] max-w-[200px] rounded border border-border/50 bg-background/95 p-2 shadow-lg backdrop-blur-sm sm:p-3"
			style={{
				left: tooltipX,
				top: tooltipY,
			}}
		>
			<div className="mb-2 border-border/30 border-b pb-2">
				<p className="font-medium text-foreground text-sm">
					{data.dayName} at {formatHour(data.hour)}
				</p>
			</div>
			<div className="space-y-1">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 rounded-full bg-primary" />
						<span className="text-muted-foreground text-xs">Commits</span>
					</div>
					<span className="font-mono font-semibold text-foreground text-sm">
						{data.commits.toLocaleString()}
					</span>
				</div>
				{data.intensity > 0 && (
					<div className="border-border/30 border-t pt-1">
						<div className="flex items-center justify-between gap-3">
							<span className="text-muted-foreground text-xs">Intensity</span>
							<span className="font-mono font-semibold text-primary text-sm">
								{Math.round(data.intensity * 100)}%
							</span>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

export default function PunchCardHeatmap({ data }: Props) {
	const [tooltip, setTooltip] = useState<TooltipData | null>(null);

	const handleMouseEnter = (cell: HeatmapCell, event: React.MouseEvent) => {
		setTooltip({
			cell,
			x: event.clientX,
			y: event.clientY,
		});
	};

	const handleMouseLeave = () => {
		setTooltip(null);
	};

	const handleMouseMove = (event: React.MouseEvent) => {
		if (tooltip) {
			setTooltip((prev) =>
				prev
					? {
							...prev,
							x: event.clientX,
							y: event.clientY,
						}
					: null
			);
		}
	};

	const { heatmapData, insights } = useMemo(() => {
		if (!data.length) {
			return {
				heatmapData: [],
				insights: {
					totalCommits: 0,
					peakDay: null as string | null,
					peakHour: null as number | null,
					mostActiveTime: null as string | null,
				},
			};
		}

		// Calculate max commits for intensity scaling
		const maxCommits = Math.max(...data.map((d) => d.commits));

		// Create 7x24 grid
		const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const grid: HeatmapCell[][] = [];

		for (let day = 0; day < 7; day++) {
			const dayData: HeatmapCell[] = [];
			for (let hour = 0; hour < 24; hour++) {
				const cell = data.find((d) => d.day === day && d.hour === hour);
				const commits = cell?.commits || 0;
				dayData.push({
					day,
					hour,
					commits,
					intensity: maxCommits > 0 ? commits / maxCommits : 0,
					dayName: days[day],
				});
			}
			grid.push(dayData);
		}

		// Calculate insights
		const totalCommits = data.reduce((sum, d) => sum + d.commits, 0);

		// Find peak day
		const dayTotals = Array.from({ length: 7 }, (_, day) => ({
			day,
			dayName: days[day],
			total: data
				.filter((d) => d.day === day)
				.reduce((sum, d) => sum + d.commits, 0),
		}));
		const peakDayData = dayTotals.reduce((max, day) =>
			day.total > max.total ? day : max
		);

		// Find peak hour
		const hourTotals = Array.from({ length: 24 }, (_, hour) => ({
			hour,
			total: data
				.filter((d) => d.hour === hour)
				.reduce((sum, d) => sum + d.commits, 0),
		}));
		const peakHourData = hourTotals.reduce((max, hour) =>
			hour.total > max.total ? hour : max
		);

		// Find most active single time slot
		const mostActive = data.reduce((max, current) =>
			current.commits > max.commits ? current : max
		);

		return {
			heatmapData: grid,
			insights: {
				totalCommits,
				peakDay: peakDayData.dayName,
				peakHour: peakHourData.hour,
				mostActiveTime: `${mostActive.dayName} at ${mostActive.hour}:00`,
			},
		};
	}, [data]);

	if (!heatmapData.length) {
		return (
			<div>
				<div className="mb-6 sm:mb-8">
					<h3 className="mb-2 font-semibold text-xl sm:text-2xl lg:text-3xl xl:text-4xl">
						Contribution Hours
					</h3>
					<p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
						When contributors are most active throughout the week
					</p>
				</div>
				<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm sm:p-8">
					<div className="py-6 text-center text-muted-foreground text-sm sm:py-8 sm:text-base">
						No punch card data available
					</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>
			</div>
		);
	}

	const getIntensityColor = (intensity: number) => {
		if (intensity === 0) {
			return 'bg-muted';
		}
		if (intensity < 0.2) {
			return 'bg-primary/20';
		}
		if (intensity < 0.4) {
			return 'bg-primary/40';
		}
		if (intensity < 0.6) {
			return 'bg-primary/60';
		}
		if (intensity < 0.8) {
			return 'bg-primary/80';
		}
		return 'bg-primary';
	};

	const formatHour = (hour: number) => {
		if (hour === 0) {
			return '12 AM';
		}
		if (hour < 12) {
			return `${hour} AM`;
		}
		if (hour === 12) {
			return '12 PM';
		}
		return `${hour - 12} PM`;
	};

	return (
		<div>
			<div className="mb-6 sm:mb-8">
				<h3 className="mb-2 font-semibold text-xl sm:text-2xl lg:text-3xl xl:text-4xl">
					Contribution Hours
				</h3>
				<p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
					When commits happen throughout the week •{' '}
					<span className="font-medium">
						{insights.totalCommits.toLocaleString()} commits
					</span>
				</p>
			</div>

			{/* Insights Cards */}
			<div className="mb-6 grid grid-cols-1 gap-3 sm:mb-8 sm:grid-cols-3 sm:gap-4">
				<div className="group relative rounded border border-border bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:p-6">
					<div className="font-bold text-xl sm:text-2xl">
						{insights.peakDay}
					</div>
					<div className="text-muted-foreground text-sm">Most Active Day</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>

				<div className="group relative rounded border border-border bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:p-6">
					<div className="font-bold text-xl sm:text-2xl">
						{insights.peakHour !== null ? formatHour(insights.peakHour) : 'N/A'}
					</div>
					<div className="text-muted-foreground text-sm">Peak Hour</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>

				<div className="group relative rounded border border-border bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:p-6">
					<div className="font-bold text-xl sm:text-2xl">
						{insights.mostActiveTime}
					</div>
					<div className="text-muted-foreground text-sm">Hottest Time Slot</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>
			</div>

			{/* Heatmap */}
			<div className="group relative rounded border border-border bg-card/50 p-3 backdrop-blur-sm sm:p-6">
				{/* Desktop view */}
				<div className="hidden sm:block">
					<div className="overflow-x-auto">
						<div className="w-full min-w-[600px] lg:min-w-[800px]">
							{/* Hour labels */}
							<div className="mb-2 grid grid-cols-[48px_1fr] gap-2">
								<div /> {/* Space for day labels */}
								<div className="grid grid-cols-24 gap-1">
									{Array.from({ length: 24 }, (_, hour) => (
										<div
											className="text-center text-muted-foreground text-xs"
											key={`hour-${hour.toString()}`}
										>
											{hour % 4 === 0 ? formatHour(hour) : ''}
										</div>
									))}
								</div>
							</div>

							{/* Heatmap grid */}
							<div className="space-y-1 overflow-hidden">
								{heatmapData.map((dayData) => (
									<div
										className="grid grid-cols-[48px_1fr] gap-2"
										key={`day-${dayData[0]?.day}`}
									>
										{/* Day label */}
										<div className="text-right font-medium text-foreground text-sm">
											{dayData[0]?.dayName}
										</div>

										{/* Hour cells */}
										<div className="grid grid-cols-24 gap-1">
											{dayData.map((cell) => (
												<div
													className={`aspect-square rounded-sm ${getIntensityColor(cell.intensity)} transition-all hover:scale-105`}
													key={`${cell.day}-${cell.hour}`}
													onMouseEnter={(e) => handleMouseEnter(cell, e)}
													onMouseLeave={handleMouseLeave}
													onMouseMove={handleMouseMove}
													role="button"
													tabIndex={0}
												/>
											))}
										</div>
									</div>
								))}
							</div>

							{/* Legend */}
							<div className="mt-4 flex items-center justify-center gap-2">
								<span className="text-muted-foreground text-sm">Less</span>
								<div className="flex gap-1">
									<div className="h-3 w-3 rounded-sm bg-muted" />
									<div className="h-3 w-3 rounded-sm bg-primary/20" />
									<div className="h-3 w-3 rounded-sm bg-primary/40" />
									<div className="h-3 w-3 rounded-sm bg-primary/60" />
									<div className="h-3 w-3 rounded-sm bg-primary/80" />
									<div className="h-3 w-3 rounded-sm bg-primary" />
								</div>
								<span className="text-muted-foreground text-sm">More</span>
							</div>
						</div>
					</div>
				</div>

				{/* Mobile view - simplified visualization */}
				<div className="block sm:hidden">
					{/* Hour labels for mobile - show fewer hours on very small screens */}
					<div className="mb-2 grid grid-cols-[24px_1fr] gap-1">
						<div /> {/* Space for day labels */}
						<div className="grid grid-cols-6 gap-1">
							{[0, 4, 8, 12, 16, 20].map((hour) => (
								<div
									className="text-center text-muted-foreground text-xs"
									key={`mobile-hour-${hour.toString()}`}
								>
									{hour === 0
										? '12A'
										: hour === 12
											? '12P'
											: hour > 12
												? `${hour - 12}P`
												: `${hour}A`}
								</div>
							))}
						</div>
					</div>

					{/* Mobile heatmap grid - aggregate 4-hour blocks */}
					<div className="space-y-1 overflow-hidden">
						{heatmapData.map((dayData) => {
							// Aggregate data into 4-hour blocks for mobile (6 blocks per day)
							const mobileBlocks: (HeatmapCell & { timeRange: string })[] = [];
							for (let i = 0; i < 24; i += 4) {
								const blocks = [
									dayData[i],
									dayData[i + 1] || {
										commits: 0,
										intensity: 0,
										day: dayData[i].day,
										hour: i + 1,
										dayName: dayData[i].dayName,
									},
									dayData[i + 2] || {
										commits: 0,
										intensity: 0,
										day: dayData[i].day,
										hour: i + 2,
										dayName: dayData[i].dayName,
									},
									dayData[i + 3] || {
										commits: 0,
										intensity: 0,
										day: dayData[i].day,
										hour: i + 3,
										dayName: dayData[i].dayName,
									},
								];

								const avgIntensity =
									blocks.reduce((sum, block) => sum + block.intensity, 0) / 4;
								const totalCommits = blocks.reduce(
									(sum, block) => sum + block.commits,
									0
								);

								mobileBlocks.push({
									...dayData[i],
									hour: i,
									commits: totalCommits,
									intensity: avgIntensity,
									timeRange: `${formatHour(i)}-${formatHour(i + 4)}`,
								});
							}

							return (
								<div
									className="grid grid-cols-[24px_1fr] gap-1"
									key={`mobile-day-${dayData[0]?.day}`}
								>
									{/* Day label */}
									<div className="text-right font-medium text-foreground text-xs leading-tight">
										{dayData[0]?.dayName.slice(0, 2)}
									</div>

									{/* Hour cells - 4-hour blocks */}
									<div className="grid grid-cols-6 gap-1">
										{mobileBlocks.map((cell, index) => (
											<div
												className={`aspect-square min-h-[24px] rounded ${getIntensityColor(cell.intensity)} transition-all active:scale-95`}
												key={`${cell.day}-mobile-${index.toString()}`}
												onTouchEnd={handleMouseLeave}
												onTouchStart={(e) => {
													const touch = e.touches[0];
													if (touch) {
														handleMouseEnter(
															{
																...cell,
																dayName: dayData[0]?.dayName || '',
															},
															{
																clientX: touch.clientX,
																clientY: touch.clientY,
															} as React.MouseEvent
														);
													}
												}}
												role="button"
												tabIndex={0}
											/>
										))}
									</div>
								</div>
							);
						})}
					</div>

					{/* Mobile legend */}
					<div className="mt-3 flex items-center justify-center gap-1.5">
						<span className="text-muted-foreground text-xs">Less</span>
						<div className="flex gap-0.5">
							<div className="h-2.5 w-2.5 rounded-sm bg-muted" />
							<div className="h-2.5 w-2.5 rounded-sm bg-primary/20" />
							<div className="h-2.5 w-2.5 rounded-sm bg-primary/40" />
							<div className="h-2.5 w-2.5 rounded-sm bg-primary/60" />
							<div className="h-2.5 w-2.5 rounded-sm bg-primary/80" />
							<div className="h-2.5 w-2.5 rounded-sm bg-primary" />
						</div>
						<span className="text-muted-foreground text-xs">More</span>
					</div>

					{/* Mobile note */}
					<div className="mt-3 text-center">
						<p className="text-muted-foreground text-xs">
							Simplified view: 4-hour blocks. Tap cells for details.
						</p>
					</div>
				</div>

				{/* Sci-fi corners */}
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
				</div>
			</div>

			{/* Additional Insights */}
			<div className="group relative mt-8 rounded border border-border bg-card/50 p-4 backdrop-blur-sm">
				<p className="text-muted-foreground text-sm">
					<span className="font-medium">Pattern analysis:</span> Based on{' '}
					{insights.totalCommits.toLocaleString()} total commits, contributors
					are most active on{' '}
					<span className="font-medium">{insights.peakDay}s</span> around{' '}
					<span className="font-medium">
						{insights.peakHour !== null
							? formatHour(insights.peakHour)
							: 'unknown time'}
					</span>
					.
					{insights.peakDay === 'Mon' ||
					insights.peakDay === 'Tue' ||
					insights.peakDay === 'Wed' ||
					insights.peakDay === 'Thu' ||
					insights.peakDay === 'Fri'
						? ' This suggests active weekday development.'
						: ' Weekend development activity detected!'}
				</p>

				{/* Sci-fi corners */}
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
				</div>
			</div>

			{/* Custom Tooltip */}
			{tooltip && (
				<CustomTooltip
					data={tooltip.cell}
					formatHour={formatHour}
					x={tooltip.x}
					y={tooltip.y}
				/>
			)}
		</div>
	);
}
