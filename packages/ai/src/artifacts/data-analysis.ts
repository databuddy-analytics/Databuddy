import { artifact } from '@ai-sdk-tools/artifacts';
import { z } from 'zod';
import { toastSchema } from '../tools/schema';
import { ChartSpec } from './charts';

export const dataAnalysisArtifact = artifact(
	'data-analysis',
	z.object({
		// Processing stage
		stage: z.enum([
			'loading',
			'query_ready',
			'chart_planning',
			'chart_ready',
			'metrics_ready',
			'analysis_ready',
		]),

		toast: toastSchema,

		// SQL preview and schema introspection
		sqlPreview: z.string().optional(),
		schemaPreview: z
			.object({
				columns: z.array(z.string()),
				types: z.record(z.string(), z.string()),
			})
			.optional(),

		// Chart spec + optional data series
		chart: z
			.object({
				spec: ChartSpec.nullable(),
				series: z
					.array(
						z.object({
							key: z.string(),
							points: z.array(
								z.object({
									x: z.union([z.string(), z.number(), z.date()]),
									y: z.number(),
								})
							),
						})
					)
					.optional(),
			})
			.optional(),

		// Table preview of rows
		tablePreview: z.array(z.record(z.string(), z.any())).optional(),

		// Metrics (basic execution info)
		metrics: z
			.object({
				executionTimeMs: z.number(),
				rowCount: z.number(),
			})
			.optional(),

		// Analysis: summary + recommendations
		analysis: z
			.object({
				summary: z.string(),
				recommendations: z.array(z.string()),
			})
			.optional(),
	})
);
