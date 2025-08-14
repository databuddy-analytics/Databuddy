export type AssistantModel = 'chat' | 'agent' | 'agent-max';

export interface ModelConfig {
	id: AssistantModel;
	name: string;
	description: string;
	icon: string;
	features: string[];
	isEnabled: boolean;
}

export const MODEL_CONFIGS: Record<AssistantModel, ModelConfig> = {
	chat: {
		id: 'chat',
		name: 'Chat',
		description: 'Quick answers and simple queries',
		icon: 'Chat',
		features: ['Fast responses', 'Simple queries', 'Basic insights'],
		isEnabled: true,
	},
	agent: {
		id: 'agent',
		name: 'Agent',
		description: 'Detailed analysis with step-by-step reasoning',
		icon: 'Agent',
		features: [
			'Step-by-step reasoning',
			'Complex queries',
			'Detailed analysis',
		],
		isEnabled: false,
	},
	'agent-max': {
		id: 'agent-max',
		name: 'Agent Max',
		description: 'Maximum intelligence for complex analytics',
		icon: 'Agent Max',
		features: ['Maximum intelligence', 'Complex analytics', 'Deep insights'],
		isEnabled: false,
	},
};
