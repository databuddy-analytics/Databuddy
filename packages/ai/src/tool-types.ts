import type { InferUITools } from 'ai';
import { getContext } from './context';
import { getDataTool } from './tools/get-data';
import { getDataAnalysisTool } from './tools/get-data-analysis';

export const createToolRegistry = () => {
	const _context = getContext();

	return {
		getDataAnalysis: getDataAnalysisTool,
		getData: getDataTool,
	};
};

// Infer the UI tools type from the registry
export type UITools = InferUITools<ReturnType<typeof createToolRegistry>>;
