// Enhanced Custom Tooltip for Error Chart
export const ErrorChartTooltip = ({ active, payload, label }: any) => {
	if (!(active && payload && payload.length)) {
		return null;
	}

	return (
		<div className="rounded-lg border border-sidebar-border bg-background/95 p-4 text-sm shadow-lg backdrop-blur-sm">
			<p className="mb-3 font-semibold text-foreground">{label}</p>
			<div className="space-y-2">
				{payload.map((entry: any) => (
					<div
						className="flex items-center gap-3"
						key={`tooltip-${entry.dataKey}-${entry.value}`}
					>
						<div
							className="h-3 w-3 rounded-full"
							style={{ backgroundColor: entry.color }}
						/>
						<span className="text-muted-foreground">{entry.name}:</span>
						<span className="font-semibold text-foreground">
							{entry.value.toLocaleString()}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};
