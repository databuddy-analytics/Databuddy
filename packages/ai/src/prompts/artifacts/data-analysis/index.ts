import { workflowPrompt } from './workflow';
import { schemaPrompt } from './schema';

export const dataAnalysisPrompt = (websiteId: string, websiteHostname: string) =>
    [workflowPrompt(websiteId, websiteHostname), schemaPrompt]
        .filter(Boolean)
        .join('\n\n')
        .trim();
