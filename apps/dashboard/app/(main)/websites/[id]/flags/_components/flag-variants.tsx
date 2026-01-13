"use client";

import type { Variant } from "@databuddy/shared/flags";
import { Cell, Pie, PieChart } from "recharts";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

const VARIANT_COLORS = [
	"#3b82f6",
	"#f97316",
	"#22c55e",
	"#a855f7",
	"#eab308",
	"#ec4899",
	"#06b6d4",
	"#ef4444",
];

export function FlagVariants({ variants }: { variants: Variant[] }) {
	if (variants.length === 0) {
		return null;
	}

	const chartData = variants.map((variant, index) => ({
		name: variant.key,
		value: variant.weight ?? 0,
		color: VARIANT_COLORS[index % VARIANT_COLORS.length],
	}));

	return (
		<Tooltip delayDuration={200}>
			<TooltipTrigger asChild>
				<span className="cursor-help underline decoration-dotted underline-offset-2">
					{variants.length} {variants.length !== 1 ? "variants" : "variant"}
				</span>
			</TooltipTrigger>
			<TooltipContent className="p-0" side="top">
				<div className="flex items-start gap-3 p-3">
					{/* Pie chart */}
					<div className="relative shrink-0">
						<PieChart height={80} width={80}>
							<Pie
								animationBegin={0}
								animationDuration={1000}
								cx="50%"
								cy="50%"
								data={chartData}
								dataKey="value"
								innerRadius={26}
								outerRadius={31}
								paddingAngle={2}
								strokeWidth={0}
							>
								{chartData.map((entry) => (
									<Cell fill={entry.color} key={entry.name} />
								))}
							</Pie>
						</PieChart>
						<span className="absolute inset-0 flex items-center justify-center font-semibold text-foreground text-xs tabular-nums">
							{variants.length}
						</span>
					</div>

					{/* Variant list */}
					<div className="flex flex-col gap-1.5">
						<p className="font-medium text-xs">Variants</p>
						{variants.map((variant, index) => (
							<div className="flex items-center gap-1.5" key={variant.key}>
								<span
									className="size-2.5 shrink-0 rounded-sm"
									style={{
										backgroundColor:
											VARIANT_COLORS[index % VARIANT_COLORS.length],
									}}
								/>
								<span className="font-mono text-xs">{variant.key}</span>
								{variant.weight !== undefined && (
									<span className="text-background/60 text-xs tabular-nums">
										({variant.weight}%)
									</span>
								)}
							</div>
						))}
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
