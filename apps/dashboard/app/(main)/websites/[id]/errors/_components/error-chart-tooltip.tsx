// Enhanced Custom Tooltip for Error Chart
export const ErrorChartTooltip = ({ active, payload, label }: any) => {
	if (!(active && payload && payload.length)) {
		return null;
	}

	return (
		<div className="rounded-lg border border-border bg-background p-3 text-xs shadow-lg">
			<p className="mb-2 font-semibold text-foreground">{label}</p>
			<div className="space-y-1.5">
				{payload.map((entry: any) => (
					<div
						className="flex items-center gap-2"
						key={`tooltip-${entry.dataKey}-${entry.value}`}
					>
						<div
							className="h-2.5 w-2.5 rounded-full"
							style={{ backgroundColor: entry.color }}
						/>
						<span className="text-muted-foreground">{entry.name}:</span>
						<span className="font-medium text-foreground">
							{entry.value.toLocaleString()}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};
