import { z } from 'zod';

export type Row = Record<string, unknown>;

export const toastSchema = z
	.object({
		visible: z.boolean(),
		currentStep: z.number().min(0),
		totalSteps: z.number().min(1),
		currentLabel: z.string(),
		stepDescription: z.string().optional(),
		completed: z.boolean().optional(),
		completedMessage: z.string().optional(),
	})
	.optional();

export const getDataAnalysisSchema = z.object({
	question: z.string().min(5, 'Please describe what you want to analyze'),
	from: z
		.string()
		.optional()
		.describe(
			'The start date when to retrieve data from (optional). Return ISO-8601 format.'
		),
	to: z
		.string()
		.optional()
		.describe(
			'The end date when to retrieve data from (optional). Return ISO-8601 format.'
		),
	showCanvas: z
		.boolean()
		.default(false)
		.describe(
			'Whether to show detailed visual analytics. Use true for in-depth analysis requests, trends, breakdowns, or when user asks for charts/visuals. Use false for simple questions or quick answers.'
		),
	maxRows: z
		.number()
		.optional()
		.describe('The maximum number of rows to return.'),
	preferredChartKind: z
		.enum([
			'line',
			'bar',
			'pie',
			'area',
			'scatter',
			'heatmap',
			'histogram',
			'table',
		])
		.optional(),
	chartHints: z.array(z.string()).optional(),
});
