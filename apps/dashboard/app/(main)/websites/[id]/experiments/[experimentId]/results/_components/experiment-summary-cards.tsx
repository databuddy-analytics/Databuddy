'use client';

import {
	CalendarIcon,
	ChartLineIcon,
	TrendUpIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { StatCard } from '@/components/analytics';
import type { Experiment } from '@/hooks/use-experiments';

interface ExperimentSummaryCardsProps {
	experiment: Experiment;
}

export function ExperimentSummaryCards({
	experiment,
}: ExperimentSummaryCardsProps) {
	const results = {
		conversionRateControl: 11.1,
		conversionRateVariant: 12.4,
		lift: 11.7,
		confidence: 95,
		sampleSizeControl: 5234,
		sampleSizeVariant: 5189,
		duration: dayjs().diff(dayjs(experiment.createdAt), 'days'),
	};

	const formatNumber = (value: number): string => {
		return Intl.NumberFormat(undefined, {
			notation: 'compact',
			maximumFractionDigits: 1,
		}).format(value);
	};

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
			<StatCard
				className="h-full"
				description={`${results.conversionRateVariant}% vs ${results.conversionRateControl}%`}
				icon={TrendUpIcon}
				title="CONVERSION LIFT"
				value={`+${results.lift}%`}
				variant="success"
			/>

			<StatCard
				className="h-full"
				description="Statistical significance"
				icon={ChartLineIcon}
				title="CONFIDENCE"
				value={`${results.confidence}%`}
			/>

			<StatCard
				className="h-full"
				description={`${formatNumber(results.sampleSizeControl)} total participants`}
				icon={UsersIcon}
				title="SAMPLE SIZE"
				value={formatNumber(
					results.sampleSizeControl + results.sampleSizeVariant
				)}
			/>
		</div>
	);
}
