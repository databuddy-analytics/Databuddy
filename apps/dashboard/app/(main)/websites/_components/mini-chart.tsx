'use client';

import dayjs from 'dayjs';
import { memo } from 'react';
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';

interface MiniChartProps {
	data: { date: string; value: number }[];
	id: string;
	days?: number;
}

const formatNumber = (num: number) => {
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toString();
};

const MiniChart = memo(({ data, id, days = 7 }: MiniChartProps) => (
	<div className="chart-container rounded">
		<ResponsiveContainer height={days > 14 ? 56 : 50} width="100%">
			<AreaChart
				aria-label={`Mini chart showing views for the last ${days} days`}
				data={data}
				margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
				role="img"
			>
				<title>{`Views over time (last ${days} days)`}</title>
				<defs>
					<linearGradient
						id={`gradient-${id}-${days}`}
						x1="0"
						x2="0"
						y1="0"
						y2="1"
					>
						<stop
							offset="5%"
							stopColor="var(--chart-color)"
							stopOpacity={0.8}
						/>
						<stop
							offset="95%"
							stopColor="var(--chart-color)"
							stopOpacity={0.1}
						/>
					</linearGradient>
				</defs>
				<XAxis dataKey="date" hide />
				<YAxis domain={['dataMin - 5', 'dataMax + 5']} hide />
				<Tooltip
					content={({ active, payload, label }) =>
						active && payload?.[0] && typeof payload[0].value === 'number' ? (
							<div className="rounded border bg-background p-2 text-xs shadow-md">
								<p className="font-medium">
									{dayjs(label as string).format('MMM D')}
								</p>
								<p className="text-primary">
									{formatNumber(payload[0].value)} views
								</p>
							</div>
						) : null
					}
				/>
				<Area
					activeDot={{ r: 3 }}
					animationDuration={600}
					animationEasing="ease-out"
					dataKey="value"
					dot={false}
					fill={`url(#gradient-${id}-${days})`}
					isAnimationActive
					stroke="var(--chart-color)"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2.5}
					type="monotone"
				/>
			</AreaChart>
		</ResponsiveContainer>
	</div>
));

MiniChart.displayName = 'MiniChart';

export default MiniChart;
