import type { RequestHints } from '../../../../apps/api/src/types/agent';
import { corePrompt } from './core';
import { dataAnalysisPrompt } from './artifacts/data-analysis';

export const getRequestPromptFromHints = (requestHints: RequestHints) => `\
<context>
    <website_id>${requestHints.websiteId}</website_id>
    <website_hostname>${requestHints.websiteHostname}</website_hostname>
    <timestamp>${requestHints.timestamp}</timestamp>
</context>`;

export const systemPrompt = ({
	selectedChatModel,
	requestHints,
}: {
	selectedChatModel: string;
	requestHints: RequestHints;
}) => {
	const { websiteHostname, websiteId } = requestHints;
	const requestPrompt = getRequestPromptFromHints(requestHints);

	if (
		selectedChatModel === 'chat-model' ||
		selectedChatModel === 'agent-model' ||
		selectedChatModel === 'agent-max-model'
	) {
		return [
			corePrompt(websiteId, websiteHostname),
			requestPrompt,
			'You follow all the user instructions and provide a detailed response.',
		]
			.filter(Boolean)
			.join('\n')
			.trim();
	}

	if (selectedChatModel === 'artifact-model') {
		return [
			corePrompt(websiteId, websiteHostname),
			dataAnalysisPrompt(websiteId, websiteHostname),
			requestPrompt,
		]
			.filter(Boolean)
			.join('\n\n')
			.trim();
	}
};
