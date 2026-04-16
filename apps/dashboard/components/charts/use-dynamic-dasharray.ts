"use client";

import { useCallback, useState } from "react";

interface ChartDataPoint {
	payload?: Record<string, unknown>;
	value?: number | string;
	x?: number;
	y?: number;
}

interface ChartLineData {
	item: {
		props: {
			dataKey: string;
		};
	};
	props: {
		points: ChartDataPoint[];
	};
}

export interface CustomizedChartProps {
	formattedGraphicalItems?: ChartLineData[];
}

interface LineConfig {
	curveAdjustment?: number;
	dashPattern?: number[];
	name: string;
	splitIndex?: number;
}

interface UseDynamicDasharrayProps {
	chartType?:
		| "linear"
		| "monotone"
		| "natural"
		| "step"
		| "stepBefore"
		| "stepAfter";
	curveAdjustment?: number;
	defaultDashPattern?: number[];
	lineConfigs?: LineConfig[];
	splitIndex?: number;
}

export type LineDasharray = {
	name: string;
	strokeDasharray: string;
}[];

export function useDynamicDasharray({
	lineConfigs = [],
	splitIndex = -2,
	defaultDashPattern: dashPattern = [5, 3],
	curveAdjustment = 1,
	chartType = "linear",
}: UseDynamicDasharrayProps): [
	(props: CustomizedChartProps) => null,
	LineDasharray,
] {
	const [lineDasharrays, setLineDasharrays] = useState<LineDasharray>([]);

	const DasharrayCalculator = useCallback(
		(props: CustomizedChartProps): null => {
			const chartLines = props?.formattedGraphicalItems;
			const newLineDasharrays: LineDasharray = [];

			const calculatePathLength = (points: ChartDataPoint[]) =>
				points?.reduce((total, point, index) => {
					if (index === 0) {
						return total;
					}

					const prevPoint = points[index - 1];
					const dx = Math.abs((point.x || 0) - (prevPoint.x || 0));
					const dy = Math.abs((point.y || 0) - (prevPoint.y || 0));

					if (
						chartType === "step" ||
						chartType === "stepBefore" ||
						chartType === "stepAfter"
					) {
						return total + dx + dy;
					}

					return total + Math.sqrt(dx * dx + dy * dy);
				}, 0) || 0;

			if (chartLines) {
				for (const line of chartLines) {
					const points = line?.props?.points;
					const totalLength = calculatePathLength(points || []);

					const lineName = line?.item?.props?.dataKey;
					const lineConfig = lineConfigs?.find(
						(config) => config?.name === lineName
					);
					const lineSplitIndex = lineConfig?.splitIndex ?? splitIndex;
					const dashedSegment = points?.slice(lineSplitIndex);
					const dashedLength = calculatePathLength(dashedSegment || []);

					if (
						totalLength === 0 ||
						dashedLength === 0 ||
						lineName === undefined
					) {
						continue;
					}

					const solidLength = totalLength - dashedLength;
					const curveCorrectionFactor =
						lineConfig?.curveAdjustment ?? curveAdjustment;
					const adjustment = (solidLength * curveCorrectionFactor) / 100;
					const solidDasharrayPart = solidLength + adjustment;

					const targetDashPattern = lineConfig?.dashPattern || dashPattern;
					const patternSegmentLength =
						(targetDashPattern?.[0] || 0) + (targetDashPattern?.[1] || 0) || 1;
					const repetitions = Math.ceil(dashedLength / patternSegmentLength);
					const dashedPatternSegments = Array.from(
						{ length: repetitions },
						() => targetDashPattern.join(" ")
					);

					const finalDasharray = `${solidDasharrayPart} ${dashedPatternSegments.join(
						" "
					)}`;
					newLineDasharrays.push({
						name: lineName,
						strokeDasharray: finalDasharray,
					});
				}
			}

			if (
				JSON.stringify(newLineDasharrays) !== JSON.stringify(lineDasharrays)
			) {
				setTimeout(() => setLineDasharrays(newLineDasharrays), 0);
			}

			return null;
		},
		[
			splitIndex,
			curveAdjustment,
			lineConfigs,
			dashPattern,
			lineDasharrays,
			chartType,
		]
	);

	return [DasharrayCalculator, lineDasharrays];
}
