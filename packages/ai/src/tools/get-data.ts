import { chQuery } from '@databuddy/db';
import { generateObject, tool } from 'ai';
import z from 'zod';
import type { Row } from '../artifacts/charts';
import { getContext } from '../context';
import { systemPrompt } from '../prompts';
import { sqlPrompt } from '../prompts/artifacts/data-analysis/tools/sql-prompt';
import { provider } from '../providers';
import { validateSQL } from '../utils/sql';
import { getDataAnalysisSchema } from './schema';

const inputSchema = getDataAnalysisSchema.omit({ showCanvas: true });

export const getDataTool = tool({
	description:
		'Get data from the database. Use this tool when users ask about data.',
	inputSchema,
	async *execute(input: z.infer<typeof inputSchema>) {
		try {
			const context = getContext();

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
				yield { text: 'The generated SQL did not pass safety validation.' };
				return {
					ok: false,
					summary: 'SQL validation failed',
				};
			}

			// Execute query
			let rows: Row[] = [];
			const qStart = Date.now();
			try {
				const result = await chQuery(sql);
				rows = Array.isArray(result) ? result : [];
			} catch (_err) {
				yield { text: 'Query execution failed.' };
				return {
					ok: false,
					summary: 'Query execution failed.',
				};
			}

			const execTime = Date.now() - qStart;

			if (rows.length === 0) {
				yield { text: 'No data available.' };

				return {
					ok: false,
					summary: 'No data available.',
				};
			}

			const response = `Here's your data:
${JSON.stringify(rows, null, 2)}

Execution time: ${execTime}ms`;

			// Return the data
			yield { text: response };
		} catch (error) {
			console.error(error);
			throw error;
		}
	},
});
