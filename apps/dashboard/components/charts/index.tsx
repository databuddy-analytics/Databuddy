import dynamic from "next/dynamic";
import { SkeletonChart } from "./skeleton-chart";

export const MetricsChart = dynamic(
	() =>
		import("./metrics-chart").then((mod) => ({ default: mod.MetricsChart })),
	{
		loading: () => (
			<SkeletonChart className="w-full" height={400} title="Loading chart..." />
		),
		ssr: false,
	}
);

export const DistributionChart = dynamic(
	() =>
		import("./distribution-chart").then((mod) => ({
			default: mod.DistributionChart,
		})),
	{
		loading: () => (
			<SkeletonChart className="w-full" height={190} title="Loading chart..." />
		),
		ssr: false,
	}
);

export { SkeletonChart } from "./skeleton-chart";
