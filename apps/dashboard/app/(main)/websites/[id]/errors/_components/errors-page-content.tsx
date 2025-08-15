'use client';

import type { DynamicQueryFilter } from '@databuddy/shared';
import { ArrowClockwiseIcon, BugIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AnimatedLoading } from '@/components/analytics/animated-loading';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDateFilters } from '@/hooks/use-date-filters';
import { useEnhancedErrorData } from '@/hooks/use-dynamic-query';
import { isAnalyticsRefreshingAtom } from '@/stores/jotai/filterAtoms';
import { WebsitePageHeader } from '../../_components/website-page-header';
import { ErrorDataTable } from './error-data-table';
// Import our separated components
import { ErrorSummaryStats } from './error-summary-stats';
import { ErrorTrendsChart } from './error-trends-chart';
import { TopErrorCard } from './top-error-card';
import type { ErrorSummary } from './types';
import { normalizeData, safeFormatDate } from './utils';

interface ErrorsPageContentProps {
	params: Promise<{ id: string }>;
}

export const ErrorsPageContent = ({ params }: ErrorsPageContentProps) => {
	const resolvedParams = use(params);
	const websiteId = resolvedParams.id;

	// Use shared date range and refresh state
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);

	const { dateRange } = useDateFilters();

	const [loadingProgress, setLoadingProgress] = useState<number>(0);

	// Filters state
	const [activeFilters, setActiveFilters] = useState<DynamicQueryFilter[]>([]);

	// Add a new filter
	const addFilter = (field: string, value: string | number) => {
		// Prevent adding duplicate filters
		if (activeFilters.some((f) => f.field === field && f.value === value)) {
			return;
		}

		const newFilter: DynamicQueryFilter = { field, operator: 'eq', value };
		setActiveFilters((prev) => [...prev, newFilter]);
	};

	// Remove a filter
	const _removeFilter = (filterToRemove: DynamicQueryFilter) => {
		setActiveFilters((prev) =>
			prev.filter(
				(f) =>
					!(
						f.field === filterToRemove.field && f.value === filterToRemove.value
					)
			)
		);
	};

	// Clear all filters
	const _clearFilters = () => {
		setActiveFilters([]);
	};

	// Fetch errors data using the enhanced hook
	const {
		results: errorResults,
		isLoading,
		refetch,
		error,
	} = useEnhancedErrorData(websiteId, dateRange, {
		filters: activeFilters,
		// Ensure the query re-runs when filters change
		queryKey: ['enhancedErrorData', websiteId, dateRange, activeFilters],
	});

	// Handle refresh
	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await refetch();
			toast.success('Error data refreshed');
		} catch (error) {
			console.error('Failed to refresh data:', error);
			toast.error('Failed to refresh error data.');
		} finally {
			setIsRefreshing(false);
		}
	}, [refetch]);

	// Process all error data
	const processedData = useMemo(() => {
		if (isLoading || !errorResults || errorResults.length === 0) {
			return {
				recent_errors: [],
				error_types: [],
				errors_by_page: [],
				error_trends: [],
				error_frequency: [],
			};
		}

		const extractData = (queryId: string) => {
			const result = errorResults.find((r) => r.queryId === queryId);
			if (!result) {
				return [];
			}

			const dataObject = result.data;

			if (
				!dataObject ||
				typeof dataObject !== 'object' ||
				Array.isArray(dataObject)
			) {
				return [];
			}

			const finalData = dataObject[queryId];

			if (!Array.isArray(finalData)) {
				return [];
			}

			return normalizeData(finalData);
		};

		const data = {
			recent_errors: extractData('recent_errors'),
			error_types: extractData('error_types'),
			errors_by_page: extractData('errors_by_page'),
			error_trends: extractData('error_trends'),
			error_frequency: extractData('error_frequency'),
		};

		return data;
	}, [errorResults, isLoading]);

	// Calculate error summary
	const errorSummary = useMemo((): ErrorSummary => {
		const recentErrors = processedData.recent_errors;
		const errorTypes = processedData.error_types;

		if (!(recentErrors.length || errorTypes.length)) {
			return {
				totalErrors: 0,
				uniqueErrorTypes: 0,
				affectedUsers: 0,
				affectedSessions: 0,
				errorRate: 0,
			};
		}

		const totalErrors = errorTypes.reduce(
			(sum: number, type: any) => sum + (type.count || 0),
			0
		);
		const uniqueErrorTypes = errorTypes.length;
		const affectedUsers = errorTypes.reduce(
			(sum: number, type: any) => sum + (type.users || 0),
			0
		);
		const affectedSessions = recentErrors.length; // Use recent errors count as session count

		// Calculate error rate based on recent errors vs total errors
		const errorRate =
			totalErrors > 0 ? (affectedSessions / totalErrors) * 100 : 0;

		return {
			totalErrors,
			uniqueErrorTypes,
			affectedUsers,
			affectedSessions,
			errorRate,
		};
	}, [processedData]);

	// Find the top error
	const topError = useMemo(() => {
		if (!processedData.error_types?.length) {
			return null;
		}

		return processedData.error_types.reduce(
			(max, error) => (error.count > max.count ? error : max),
			processedData.error_types[0]
		);
	}, [processedData.error_types]);

	// Chart data for error trends
	const errorChartData = useMemo(() => {
		if (!processedData.error_trends?.length) {
			return [];
		}

		return processedData.error_trends.map((point: any) => ({
			date: safeFormatDate(point.date, 'MMM d'),
			'Total Errors': point.errors || 0,
			'Affected Users': point.users || 0,
		}));
	}, [processedData.error_trends]);

	// Handle loading progress animation
	useEffect(() => {
		if (isLoading) {
			setLoadingProgress(0); // Reset progress when loading starts

			const intervals = [
				{ target: 20, duration: 800 },
				{ target: 45, duration: 1300 },
				{ target: 70, duration: 1800 },
				{ target: 90, duration: 2200 },
				{ target: 100, duration: 2500 },
			];

			let currentIndex = 0;
			let animationId: number;

			const updateProgress = () => {
				if (currentIndex < intervals.length) {
					const { target, duration } = intervals[currentIndex];
					const startProgress =
						currentIndex === 0 ? 0 : intervals[currentIndex - 1]?.target || 0;
					const progressDiff = target - startProgress;
					const startTime = Date.now();

					const animate = () => {
						const elapsed = Date.now() - startTime;
						const progress = Math.min(elapsed / duration, 1);
						const currentProgress = startProgress + progressDiff * progress;

						setLoadingProgress(currentProgress);

						if (progress < 1) {
							animationId = requestAnimationFrame(animate);
						} else {
							currentIndex++;
							updateProgress();
						}
					};

					animate();
				}
			};

			updateProgress();

			// Cleanup function to cancel animation
			return () => {
				if (animationId) {
					cancelAnimationFrame(animationId);
				}
			};
		}

		setLoadingProgress(0);
	}, [isLoading]); // Removed loadingProgress from dependencies

	if (error) {
		return (
			<div className="mx-auto max-w-[1600px] p-3 sm:p-4 lg:p-6">
				<Card className="rounded-xl border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
					<CardContent className="pt-6">
						<div className="flex flex-col items-center space-y-3 text-center">
							<div className="rounded-full border border-destructive/20 bg-destructive/10 p-3">
								<BugIcon
									className="h-6 w-6 text-destructive"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<h4 className="font-semibold text-destructive">
									Error loading error data
								</h4>
								<p className="mt-1 text-destructive/80 text-sm">
									There was an issue loading your error analytics. Please try
									refreshing the page.
								</p>
							</div>
							<Button
								className="gap-2 rounded-lg"
								onClick={handleRefresh}
								size="sm"
								variant="outline"
							>
								<ArrowClockwiseIcon
									className="h-4 w-4"
									size={16}
									weight="fill"
								/>
								Retry
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto mt-6 max-w-[1600px] space-y-6">
			<WebsitePageHeader
				description="Monitor and analyze application errors to improve user experience"
				icon={
					<BugIcon
						className="h-6 w-6 text-primary"
						size={16}
						weight="duotone"
					/>
				}
				isRefreshing={isRefreshing}
				onRefresh={handleRefresh}
				title="Error Analytics"
				websiteId={websiteId}
			/>

			{isLoading ? (
				<AnimatedLoading progress={loadingProgress} type="errors" />
			) : (
				<>
					{/* Main Content Grid */}
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
						{/* Left Column: Chart */}
						<div className="lg:col-span-2">
							<ErrorTrendsChart errorChartData={errorChartData} />
						</div>

						{/* Right Column: KPIs and Top Error */}
						<div className="space-y-4">
							<ErrorSummaryStats
								errorSummary={errorSummary}
								isLoading={isLoading}
							/>
							<TopErrorCard topError={topError} />
						</div>
					</div>

					{/* Error Analysis Tables */}
					<ErrorDataTable
						isLoading={isLoading}
						isRefreshing={isRefreshing}
						onRowClick={addFilter}
						processedData={{
							error_types: processedData.error_types,
							errors_by_page: processedData.errors_by_page,
						}}
					/>
				</>
			)}
		</div>
	);
};
