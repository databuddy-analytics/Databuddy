import { cn } from "@/lib/utils";

type SparklinePoint = {
	value: number;
};

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function UptimeSparkline({
	className,
	points,
}: {
	className?: string;
	points: SparklinePoint[];
}) {
	if (points.length < 2) {
		return (
			<div
				aria-hidden="true"
				className={cn("h-10 w-full rounded-none bg-muted", className)}
			/>
		);
	}

	const width = 320;
	const height = 40;
	const pad = 2;

	const values = points.map((p) => p.value);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = Math.max(0.0001, max - min);

	const d = points
		.map((p, index) => {
			const x = pad + (index / (points.length - 1)) * (width - pad * 2);
			const t = (p.value - min) / range;
			const y = pad + (1 - clamp(t, 0, 1)) * (height - pad * 2);
			return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
		})
		.join(" ");

	return (
		<svg
			aria-hidden="true"
			className={cn("h-10 w-full", className)}
			viewBox={`0 0 ${width} ${height}`}
		>
			<title>Uptime trend</title>
			<path
				className="fill-none stroke-muted-foreground/30"
				d={`M ${pad} ${height - pad} L ${width - pad} ${height - pad}`}
				strokeWidth="1"
			/>
			<path
				className="fill-none text-primary"
				d={d}
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
			/>
		</svg>
	);
}
