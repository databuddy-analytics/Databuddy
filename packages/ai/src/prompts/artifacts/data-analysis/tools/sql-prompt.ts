import type { z } from 'zod';
import { getDataAnalysisSchema } from '../../../../tools/schema';

const inputSchema = getDataAnalysisSchema.omit({ showCanvas: true });

export const sqlPrompt = (input: z.infer<typeof inputSchema>) => {
	const { question, from, to, maxRows } = input;
	const lines: string[] = [];
	lines.push(`question: ${question}`);
	if (from) {
		lines.push(`from: ${from}`);
	}
	if (to) {
		lines.push(`to: ${to}`);
	}
	if (maxRows) {
		lines.push(`max rows: ${maxRows}`);
	}

	return `
<sql_prompt>
    You produce a SQL query for retrieving data from the database.
    Requirements:
    ${lines.map((line) => `- ${line}`).join('\n')}
</sql_prompt>
`;
};
