export interface UptimeHeatmapCellClassInput {
	hasData: boolean;
	/** `true` adds hover:bg-* pairs for interactive heatmap cells */
	interactive: boolean;
	isActive: boolean;
	uptimePercent: number;
}

export function getUptimeHeatmapCellClass(
	input: UptimeHeatmapCellClassInput
): string {
	if (!input.isActive) {
		return "bg-muted";
	}
	if (!input.hasData) {
		return "bg-secondary";
	}

	const { uptimePercent: u, interactive } = input;

	if (u >= 99.9) {
		return interactive
			? "bg-emerald-500 hover:bg-emerald-600"
			: "bg-emerald-500";
	}
	if (u >= 99) {
		return interactive ? "bg-amber-300 hover:bg-amber-400" : "bg-amber-300";
	}
	if (u >= 97) {
		return interactive ? "bg-amber-400 hover:bg-amber-500" : "bg-amber-400";
	}
	if (u >= 95) {
		return interactive ? "bg-amber-500 hover:bg-amber-600" : "bg-amber-500";
	}
	if (u >= 90) {
		return interactive ? "bg-orange-500 hover:bg-orange-600" : "bg-orange-500";
	}
	return interactive ? "bg-red-500 hover:bg-red-600" : "bg-red-500";
}
