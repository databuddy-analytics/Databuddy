export function RolloutProgress({ percentage }: { percentage: number }) {
	const size = 36;
	const strokeWidth = 3;
	const radius = (size - strokeWidth) / 2;
	const circumference = radius * 2 * Math.PI;
	const offset = circumference - (percentage / 100) * circumference;

	return (
		<div className="relative inline-flex items-center justify-center">
			<svg className="-rotate-90" height={size} width={size}>
				<title>Rollout: {percentage}%</title>
				<circle
					className="text-accent"
					cx={size / 2}
					cy={size / 2}
					fill="transparent"
					r={radius}
					stroke="currentColor"
					strokeWidth={strokeWidth}
				/>
				<circle
					className="text-primary transition-all duration-500"
					cx={size / 2}
					cy={size / 2}
					fill="transparent"
					r={radius}
					stroke="currentColor"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
					strokeWidth={strokeWidth}
				/>
			</svg>
			<span className="absolute font-medium text-[10px] text-foreground tabular-nums">
				{percentage}%
			</span>
		</div>
	);
}
