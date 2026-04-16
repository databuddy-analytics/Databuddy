import { Skeleton } from "@/components/ui/skeleton";
import { chartSurfaceClassName } from "@/lib/chart-presentation";
import { cn } from "@/lib/utils";

interface SkeletonChartProps {
	className?: string;
	height?: number;
}

const SKELETON_BAR_HEIGHTS = [78, 95, 42, 110, 63, 87, 55];

export function SkeletonChart({ height = 550, className }: SkeletonChartProps) {
	return (
		<div className={cn(chartSurfaceClassName, className)}>
			<div className="p-0">
				<div
					className="relative select-none"
					style={{ width: "100%", height: height + 20 }}
				>
					<div className="absolute inset-0 overflow-hidden">
						<div className="absolute right-0 bottom-12 left-0 flex items-end justify-between px-16 pl-20">
							{SKELETON_BAR_HEIGHTS.map((barHeight, i) => (
								<div
									className="animate-pulse rounded-t bg-foreground/10"
									key={`skeleton-${i + 1}`}
									style={{
										width: "12%",
										height: `${barHeight}px`,
										animationDelay: `${i * 100}ms`,
										opacity: 0.8,
									}}
								/>
							))}
						</div>

						<Skeleton className="absolute right-8 bottom-16 left-16 h-px bg-foreground/10" />

						<div className="absolute right-8 bottom-10 left-16 flex justify-between">
							{Array.from({ length: 7 }).map((_, i) => (
								<Skeleton
									className="h-2 w-10 rounded bg-foreground/10"
									key={`skeleton-x-${i + 1}`}
								/>
							))}
						</div>

						<Skeleton className="absolute top-8 bottom-16 left-16 w-px bg-foreground/10" />

						<div className="absolute top-8 bottom-20 left-4 flex flex-col justify-between">
							{Array.from({ length: 4 }).map((_, i) => (
								<Skeleton
									className="h-2 w-8 rounded bg-foreground/10"
									key={`skeleton-y-${i + 1}`}
								/>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
