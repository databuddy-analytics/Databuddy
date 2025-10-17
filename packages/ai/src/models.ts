export const DEFAULT_CHAT_MODEL: string = 'chat-model';

export interface ChatModel {
	id: string;
	name: string;
	description: string;
}

export const chatModels: ChatModel[] = [
	{
		id: 'chat-model',
		name: 'Chat',
		description: 'Primary model for all-purpose chat',
	},
	{
		id: 'agent-model',
		name: 'Agent',
		description: 'Model for agentic tasks with limited context',
	},
	{
		id: 'agent-max-model',
		name: 'Agent max',
		description: 'Model for agentic tasks with maximum context',
	},
];
