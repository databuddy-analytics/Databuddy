'use client';

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
}

const formatNumber = (num: number) => {
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
	if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
	return num.toString();
};

const MiniChart = memo(({ data, id }: MiniChartProps) => (
	<div className="chart-container">
		<ResponsiveContainer height={50} width="100%">
			<AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
				<defs>
					<linearGradient id={`gradient-${id}`} x1="0" x2="0" y1="0" y2="1">
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
							<div className="rounded-lg border bg-background p-2 text-sm shadow-lg">
								<p className="font-medium">
									{new Date(label).toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
									})}
								</p>
								<p className="text-primary">
									{formatNumber(payload[0].value)} views
								</p>
							</div>
						) : null
					}
				/>
				<Area
					dataKey="value"
					dot={false}
					fill={`url(#gradient-${id})`}
					stroke="var(--chart-color)"
					strokeWidth={2.5}
					type="monotone"
				/>
			</AreaChart>
		</ResponsiveContainer>
	</div>
));

MiniChart.displayName = 'MiniChart';

export default MiniChart;
