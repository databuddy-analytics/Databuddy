import { BarChart3Icon } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonChartProps {
	height?: number;
	title?: string;
	className?: string;
}

export function SkeletonChart({
	height = 300,
	title,
	className,
}: SkeletonChartProps) {
	return (
		<Card
			className={`border-0 bg-gradient-to-br from-background to-muted/20 shadow-lg ${className}`}
		>
			<CardHeader className="px-3 pt-3 pb-0.5">
				{title ? (
					<>
						<CardTitle className="font-medium text-xs">{title}</CardTitle>
						<CardDescription className="text-xs">
							Loading data...
						</CardDescription>
					</>
				) : (
					<>
						<Skeleton className="mb-1 h-3 w-32 rounded-md" />
						<Skeleton className="h-2.5 w-40 rounded-md" />
					</>
				)}
			</CardHeader>
			<CardContent style={{ height: `${height}px` }}>
				<div className="relative h-full w-full overflow-hidden">
					<div className="flex h-full items-center justify-center">
						<BarChart3Icon
							className="h-12 w-12 animate-pulse text-muted-foreground/20"
							strokeWidth={1}
						/>
					</div>

					{/* Skeleton lines with gradient effect */}
					<div className="absolute right-0 bottom-12 left-0 flex items-end justify-between px-4">
						{Array.from({ length: 7 }).map((_, i) => (
							<div
								className="animate-pulse rounded-t-md bg-gradient-to-t from-primary/10 to-primary/30 shadow-sm"
								key={`skeleton-${i + 1}`}
								style={{
									width: "12%",
									height: `${20 + Math.random() * 100}px`,
									animationDelay: `${i * 100}ms`,
									opacity: 0.8,
								}}
							/>
						))}
					</div>

					{/* Bottom axis */}
					<Skeleton className="absolute right-0 bottom-6 left-0 mx-4 h-0.5 rounded-full" />

					{/* X-axis labels */}
					<div className="absolute right-0 bottom-0 left-0 flex justify-between px-4">
						{Array.from({ length: 7 }).map((_, i) => (
							<Skeleton
								className="h-2 w-10 rounded-md"
								key={`skeleton-x-${i + 1}`}
							/>
						))}
					</div>

					{/* Y-axis */}
					<Skeleton className="absolute top-4 bottom-6 left-4 w-0.5 rounded-full" />

					{/* Y-axis labels */}
					<div className="absolute top-4 bottom-12 left-0 flex flex-col justify-between">
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton
								className="ml-1 h-2 w-6 rounded-md"
								key={`skeleton-y-${i + 1}`}
							/>
						))}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
