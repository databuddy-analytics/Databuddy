'use client';

import { useArtifact } from '@ai-sdk-tools/artifacts/client';
import { dataAnalysisArtifact } from '@databuddy/ai/artifacts';
import { DataAnalysisChart } from '@/components/charts/data-analysis-chart';
import {
	BaseCanvas,
	CanvasChart,
	CanvasGrid,
	CanvasHeader,
	CanvasSection,
} from './base';
import { CanvasContent } from './base/canvas-content';

type MetricItem = {
	id: string;
	title: string;
	value: string;
	subtitle?: string;
};

function formatMs(ms?: number) {
	if (!ms && ms !== 0) {
		return '—';
	}
	if (ms < 1000) {
		return `${ms} ms`;
	}
	const s = (ms / 1000).toFixed(2);
	return `${s}s`;
}

export function DataAnalysisCanvas(_props: { websiteId: string }) {
	// Pulls the latest artifact snapshot for this tool
	const { data, status } = useArtifact(dataAnalysisArtifact);

	const isLoading = status === 'loading';
	const stage = data?.stage;

	const metrics: MetricItem[] = [
		{
			id: 'rows',
			title: 'Rows Returned',
			value: data?.metrics
				? `${data.metrics.rowCount}`
				: isLoading
					? 'Loading...'
					: '0',
			subtitle: data?.schemaPreview
				? `${Object.keys(data.schemaPreview.types || {}).length} columns`
				: undefined,
		},
		{
			id: 'time',
			title: 'Execution Time',
			value: data?.metrics
				? formatMs(data.metrics.executionTimeMs)
				: isLoading
					? 'Loading...'
					: '—',
			subtitle: data?.sqlPreview ? 'Read-only SQL' : undefined,
		},
	];

	const showChart =
		stage &&
		[
			'chart_planning',
			'chart_ready',
			'metrics_ready',
			'analysis_ready',
		].includes(stage);

	const showSummarySkeleton = !stage || stage !== 'analysis_ready';
	const showRecommendationsSkeleton = !stage || stage !== 'analysis_ready';

	return (
		<BaseCanvas>
			<CanvasHeader
				description={
					data?.sqlPreview
						? 'Result of a validated read-only SQL query'
						: undefined
				}
				isLoading={isLoading}
				title="Analysis"
			/>

			<CanvasContent>
				<div className="space-y-8">
					{/* SQL preview and schema snapshot */}
					{data?.sqlPreview ? (
						<CanvasSection className="mt-0" title="Query">
							<pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-[11px] text-muted-foreground leading-5">
								{data.sqlPreview}
							</pre>
						</CanvasSection>
					) : null}

					{data?.schemaPreview ? (
						<CanvasSection title="Schema">
							<div className="grid grid-cols-2 gap-3 text-[12px] md:grid-cols-3">
								{data.schemaPreview.columns.map((c) => (
									<div className="rounded border border-border p-2" key={c}>
										<div className="text-muted-foreground">{c}</div>
										<div className="text-foreground">
											{data.schemaPreview?.types?.[c] ?? 'unknown'}
										</div>
									</div>
								))}
							</div>
						</CanvasSection>
					) : null}

					{/* Chart */}
					{showChart && (
						<CanvasChart
							height="24rem"
							isLoading={stage === 'chart_planning'}
							legend={undefined}
							title={data?.chart?.spec?.title ?? 'Visualization'}
						>
							<DataAnalysisChart
								height={360}
								rows={data?.tablePreview ?? []}
								spec={data?.chart?.spec ?? null}
							/>
						</CanvasChart>
					)}

					{/* Metrics */}
					<CanvasGrid
						isLoading={
							stage === 'loading' ||
							stage === 'chart_planning' ||
							stage === 'query_ready'
						}
						items={metrics}
						layout="2/2"
					/>

					{/* Summary */}
					<CanvasSection isLoading={showSummarySkeleton} title="Summary">
						<div className="space-y-3">
							{data?.analysis?.summary ? (
								<p className="text-[13px] leading-6">{data.analysis.summary}</p>
							) : null}
						</div>
					</CanvasSection>

					{/* Recommendations */}
					<CanvasSection
						isLoading={showRecommendationsSkeleton}
						title="Recommendations"
					>
						<div className="space-y-3">
							{data?.analysis?.recommendations?.length ? (
								<ul className="list-disc space-y-1 pl-5 text-[13px] leading-6">
									{data.analysis.recommendations.map((r, i) => (
										<li key={i}>{r}</li>
									))}
								</ul>
							) : null}
						</div>
					</CanvasSection>
				</div>
			</CanvasContent>
		</BaseCanvas>
	);
}
