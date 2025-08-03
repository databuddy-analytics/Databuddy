'use client';

import { ArrowCounterClockwiseIcon, BugIcon } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { Area, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { ErrorChartTooltip } from './error-chart-tooltip';

// Dynamically import chart components for better performance
const ResponsiveContainer = dynamic(
	() => import('recharts').then((mod) => mod.ResponsiveContainer),
	{ ssr: false }
);
const AreaChart = dynamic(
	() => import('recharts').then((mod) => mod.AreaChart),
	{ ssr: false }
);
const Brush = dynamic(() => import('recharts').then((mod) => mod.Brush), {
	ssr: false,
});

interface ErrorTrendsChartProps {
	errorChartData: Array<{
		date: string;
		'Total Errors': number;
		'Affected Users': number;
	}>;
}

export const ErrorTrendsChart = ({ errorChartData }: ErrorTrendsChartProps) => {
	const [zoomDomain, setZoomDomain] = useState<{
		startIndex?: number;
		endIndex?: number;
	}>({});
	const [isZoomed, setIsZoomed] = useState(false);

	const resetZoom = useCallback(() => {
		setZoomDomain({});
		setIsZoomed(false);
	}, []);

	const handleBrushChange = useCallback((brushData: any) => {
		if (
			brushData &&
			brushData.startIndex !== undefined &&
			brushData.endIndex !== undefined
		) {
			setZoomDomain({
				startIndex: brushData.startIndex,
				endIndex: brushData.endIndex,
			});
			setIsZoomed(true);
		}
	}, []);

	if (!errorChartData.length) {
		return (
			<div className="flex h-full items-center justify-center rounded-lg border bg-muted/20 p-6 shadow-sm">
				<div className="text-center">
					<BugIcon
						className="mx-auto h-8 w-8 text-muted-foreground"
						size={16}
						weight="duotone"
					/>
					<h3 className="mt-2 font-medium text-muted-foreground text-sm">
						No error trend data
					</h3>
					<p className="mt-1 text-muted-foreground text-xs">
						Not enough data to display a trend chart.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col rounded-lg border shadow-sm">
			<div className="flex items-center justify-between border-b p-4">
				<div>
					<h3 className="font-semibold text-base">Error Trends</h3>
					<p className="text-muted-foreground text-xs">
						Error occurrences and impact over time
					</p>
				</div>
				{errorChartData.length > 5 && (
					<div className="flex items-center gap-2">
						{isZoomed && (
							<Button
								className="h-7 px-2 text-xs"
								onClick={resetZoom}
								size="sm"
								variant="outline"
							>
								<ArrowCounterClockwiseIcon
									className="mr-1 h-3 w-3"
									size={16}
									weight="duotone"
								/>
								Reset Zoom
							</Button>
						)}
						<div className="text-muted-foreground text-xs">Drag to zoom</div>
					</div>
				)}
			</div>
			<div className="flex-1 p-2">
				<div style={{ width: '100%', height: 300 }}>
					<ResponsiveContainer height="100%" width="100%">
						<AreaChart
							data={errorChartData}
							margin={{
								top: 10,
								right: 10,
								left: 0,
								bottom: errorChartData.length > 5 ? 35 : 5,
							}}
						>
							<defs>
								<linearGradient
									id="colorTotalErrors"
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
									<stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
								</linearGradient>
								<linearGradient
									id="colorAffectedUsers"
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
									<stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
								</linearGradient>
							</defs>
							<CartesianGrid
								stroke="var(--border)"
								strokeDasharray="3 3"
								strokeOpacity={0.5}
								vertical={false}
							/>
							<XAxis
								axisLine={false}
								dataKey="date"
								dy={5}
								tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
								tickLine={false}
							/>
							<YAxis
								axisLine={false}
								tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
								tickFormatter={(value) => {
									if (value >= 1_000_000) {
										return `${(value / 1_000_000).toFixed(1)}M`;
									}
									if (value >= 1000) {
										return `${(value / 1000).toFixed(1)}k`;
									}
									return value.toString();
								}}
								tickLine={false}
								width={30}
							/>
							<Tooltip
								content={<ErrorChartTooltip />}
								wrapperStyle={{ outline: 'none' }}
							/>
							<Legend
								iconSize={8}
								iconType="circle"
								wrapperStyle={{
									fontSize: '10px',
									paddingTop: '5px',
									bottom: errorChartData.length > 5 ? 20 : 0,
								}}
							/>
							<Area
								dataKey="Total Errors"
								fill="url(#colorTotalErrors)"
								fillOpacity={1}
								name="Total Errors"
								stroke="#ef4444"
								strokeWidth={2}
								type="monotone"
							/>
							<Area
								dataKey="Affected Users"
								fill="url(#colorAffectedUsers)"
								fillOpacity={1}
								name="Affected Users"
								stroke="#f59e0b"
								strokeWidth={2}
								type="monotone"
							/>
							{errorChartData.length > 5 && (
								<Brush
									dataKey="date"
									endIndex={zoomDomain.endIndex}
									fill="var(--muted)"
									fillOpacity={0.1}
									height={25}
									onChange={handleBrushChange}
									padding={{ top: 5, bottom: 5 }}
									startIndex={zoomDomain.startIndex}
									stroke="var(--border)"
								/>
							)}
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
};
