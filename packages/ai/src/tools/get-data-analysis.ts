'use server';
import { chQuery } from '@databuddy/db';
import { generateObject, smoothStream, streamText, tool } from 'ai';
import { z } from 'zod';
import {
	ChartSpec,
	type Row,
	sanitizeChartSpec,
	summarizeSchema,
} from '../artifacts/charts';
import { dataAnalysisArtifact } from '../artifacts/data-analysis';
import { getContext } from '../context';
import { systemPrompt } from '../prompts';
import { chartPrompt } from '../prompts/artifacts/data-analysis/tools/chart-prompt';
import { insightPrompt } from '../prompts/artifacts/data-analysis/tools/insight-prompt';
import { sqlPrompt } from '../prompts/artifacts/data-analysis/tools/sql-prompt';
import { provider } from '../providers';
import { safeValue } from '../utils/safe-value';
import { validateSQL } from '../utils/sql';
import { getDataAnalysisSchema } from './schema';

const inputSchema = getDataAnalysisSchema.omit({ showCanvas: true });

export const getDataAnalysisTool = tool({
	description:
		'Generate comprehensive data analysis with interactive visualizations, and actionable insights. Use this tool when users want detailed data analysis, visual charts, or need to understand their data.',
	inputSchema, // Remove showCanvas since this always shows canvas
	async *execute(input: z.infer<typeof inputSchema>) {
		try {
			const context = getContext();
			const userFirstName =
				safeValue(context?.user.name?.split(' ')[0]) || 'there';

			const analysis = dataAnalysisArtifact.stream({
				stage: 'loading',
				toast: {
					visible: true,
					currentStep: 0,
					totalSteps: 4,
					currentLabel: 'Loading data',
					stepDescription: 'Fetching data from Databuddy',
				},
			});

			const initialMessageStream = streamText({
				model: provider.languageModel('artifact-model'),
				system: `You are an assistant generating a brief initial message for a data analysis. 

The user has requested a data analysis. Create a message that:
- Explains what you're currently doing (gathering data)
- Mentions the specific insights they'll receive
- Uses a warm, personal tone while staying professional
- Uses the user's first name (${userFirstName}) when appropriate
- Avoids generic phrases like "Got it! Let's dive into..." or "Thanks for reaching out"
- Keep it concise (1-2 sentences max)

Example format: "I'm analyzing your data to show your [xyz]"`,
				messages: [
					{
						role: 'user',
						content:
							'Generate a brief initial message for a data analysis request.',
					},
				],
				experimental_transform: smoothStream({ chunking: 'word' }),
			});

			let completeMessage = '';
			for await (const chunk of initialMessageStream.textStream) {
				completeMessage += chunk;
				yield { text: completeMessage };
			}
			completeMessage += '\n';
			yield { text: completeMessage };

			const { object: sqlObject } = await generateObject({
				model: provider.languageModel('artifact-model'),
				system: systemPrompt({
					selectedChatModel: 'artifact-model',
					requestHints: {
						websiteId: context.websiteId,
						websiteHostname: context.websiteHostname,
						timestamp: new Date().toISOString(),
					},
				}),
				schema: z.object({
					sql: z.string().describe('The SQL query to execute'),
				}),
				messages: [{ role: 'user', content: sqlPrompt(input) }],
			});

			const sql = sqlObject.sql;
			if (!validateSQL(sql)) {
				await analysis.update({
					stage: 'analysis_ready',
					chart: { spec: null, series: [] },
					tablePreview: [],
					analysis: {
						summary: 'The generated SQL did not pass safety validation.',
						recommendations: [
							'Rephrase your request to focus on SELECT based analytics',
							'Specify the table and time window you want to analyze',
						],
					},
					toast: {
						visible: false,
						currentStep: 4,
						totalSteps: 4,
						currentLabel: 'Validation failed',
						stepDescription: 'Query blocked by safety rules',
						completed: true,
						completedMessage: 'Validation failed',
					},
				});

				return {
					ok: false,
					summary: 'SQL validation failed',
				};
			}

			await analysis.update({
				stage: 'query_ready',
				sqlPreview: sql.length > 800 ? `${sql.slice(0, 800)} ...` : sql,
				toast: {
					visible: true,
					currentStep: 1,
					totalSteps: 4,
					currentLabel: 'Running query',
					stepDescription: 'Executing SQL query on ClickHouse',
				},
			});
			yield { text: completeMessage };

			// Execute query
			let rows: Row[] = [];
			const qStart = Date.now();
			try {
				const result = await chQuery(sql);
				rows = Array.isArray(result) ? result : [];
			} catch (_err) {
				await analysis.update({
					stage: 'analysis_ready',
					chart: { spec: null, series: [] },
					tablePreview: [],
					analysis: {
						summary: 'Query execution failed.',
						recommendations: [
							'Check column names or joins',
							'Try a smaller window or fewer fields',
						],
					},
					toast: {
						visible: false,
						currentStep: 5,
						totalSteps: 5,
						currentLabel: 'Query failed',
						stepDescription: 'Database error',
						completed: true,
						completedMessage: 'Query failed',
					},
				});
				return { ok: false, summary: 'query error' };
			}
			const execTime = Date.now() - qStart;

			if (rows.length === 0) {
				await analysis.update({
					stage: 'analysis_ready',
					chart: { spec: null, series: [] },
					tablePreview: [],
					metrics: { executionTimeMs: execTime, rowCount: 0 },
					analysis: {
						summary: 'No rows returned.',
						recommendations: [
							'Widen the date range',
							'Relax filters or groupings',
							'Verify the source has data',
						],
					},
					toast: {
						visible: false,
						currentStep: 5,
						totalSteps: 5,
						currentLabel: 'No data',
						stepDescription: 'Empty result',
						completed: true,
						completedMessage: 'No data returned',
					},
				});
				return {
					ok: true,
					summary: 'No data returned.',
					rowCount: 0,
					executionTime: execTime,
				};
			}
			// Schema summary for chart generation
			const schema = summarizeSchema(rows);

			await analysis.update({
				stage: 'chart_planning',
				metrics: { executionTimeMs: execTime, rowCount: rows.length },
				tablePreview: rows.slice(0, 20),
				schemaPreview: schema,
				toast: {
					visible: true,
					currentStep: 2,
					totalSteps: 5,
					currentLabel: 'Choosing chart',
					stepDescription: 'Selecting chart type',
				},
			});
			yield { text: completeMessage };

			const { object: chartGen } = await generateObject({
				model: provider.languageModel('artifact-model'),
				system: chartPrompt(context.websiteId, context.websiteHostname),
				schema: ChartSpec,
				messages: [
					{
						role: 'user',
						content: JSON.stringify({
							question: input.question,
							preferredChartKind: input.preferredChartKind ?? null,
							schema,
							sample: rows.slice(0, 50),
						}),
					},
				],
			});

			const safeSpec = sanitizeChartSpec(chartGen);
			await analysis.update({
				stage: 'chart_ready',
				chart: { spec: safeSpec, series: [] },
				tablePreview: rows.slice(0, 100),
				toast: {
					visible: true,
					currentStep: 3,
					totalSteps: 5,
					currentLabel: 'Rendering',
					stepDescription: `Rendering ${safeSpec.kind} chart`,
				},
			});
			yield { text: completeMessage };

			// Concise insights
			const numericKeys = Object.entries(schema.types)
				.filter(([, t]) => t === 'number')
				.map(([k]) => k);

			const timeKey =
				Object.entries(schema.types).find(([, t]) => t === 'date')?.[0] ?? null;

			const { object: analysisGen } = await generateObject({
				model: provider.languageModel('artifact-model'),
				system: insightPrompt(),
				schema: z.object({
					summary: z.string(),
					recommendations: z.array(z.string()),
				}),
				messages: [
					{
						role: 'user',
						content: JSON.stringify({
							schema,
							sample: rows.slice(0, 50),
							rowCount: rows.length,
							timeKey,
							numericKeys,
						}),
					},
				],
			});

			await analysis.update({
				stage: 'metrics_ready',
				metrics: { executionTimeMs: execTime, rowCount: rows.length },
				analysis: analysisGen,
				toast: {
					visible: true,
					currentStep: 4,
					totalSteps: 5,
					currentLabel: 'Generating insights',
					stepDescription: 'Writing a short summary',
				},
			});
			yield { text: completeMessage };

			// Final body stream
			const responseStream = streamText({
				model: provider.languageModel('artifact-model'),
				system: `
You are producing ONLY the analysis body for the canvas.
Sections:
## Data Snapshot
## Key Metrics
## Trends and Insights
## What To Explore Next
Keep it tight. No greeting.
`.trim(),
				messages: [
					{
						role: 'user',
						content: JSON.stringify({
							rowCount: rows.length,
							executionTimeMs: execTime,
							hasTimeSeries: Boolean(timeKey),
							metrics: numericKeys.slice(0, 3),
							recommendations: analysisGen.recommendations,
						}),
					},
				],
				experimental_transform: smoothStream({ chunking: 'word' }),
			});

			let body = '';
			for await (const chunk of responseStream.textStream) {
				body += chunk;
				yield { text: completeMessage + body };
			}
			completeMessage += body;

			await analysis.update({
				stage: 'analysis_ready',
				metrics: { executionTimeMs: execTime, rowCount: rows.length },
				analysis: analysisGen,
				toast: {
					visible: false,
					currentStep: 5,
					totalSteps: 5,
					currentLabel: 'Analysis complete',
					stepDescription: 'Done',
					completed: true,
					completedMessage: 'Data analysis complete',
				},
			});

			// Yield the final response with forceStop flag
			// Always stop for analysis tool since canvas is complete
			yield { text: completeMessage, forceStop: true };
		} catch (error) {
			console.error(error);
			throw error;
		}
	},
});
