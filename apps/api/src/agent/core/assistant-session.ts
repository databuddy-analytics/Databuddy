import type { User } from '@databuddy/auth';
import { createId, type Website } from '@databuddy/shared';
import type { AssistantRequestType } from '../../schemas';

export interface AssistantMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface SessionMetrics {
	aiResponseTime: number;
	totalProcessingTime: number;
	tokenUsage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

export interface SessionContext {
	user: User;
	website: Website;
	conversationId: string;
	model: 'chat' | 'agent' | 'agent-max';
}

/**
 * Represents a single assistant interaction session
 * Manages the lifecycle of one request/response cycle
 */
export class AssistantSession {
	private readonly context: SessionContext;
	private readonly messages: AssistantMessage[];
	private readonly startTime: number;
	private readonly debugLogs: string[] = [];
	private metrics: Partial<SessionMetrics> = {};

	constructor(request: AssistantRequestType, user: User, website: Website) {
		this.context = {
			user,
			website,
			conversationId: request.conversationId || createId(),
			model: request.model || 'chat',
		};
		this.messages = request.messages;
		this.startTime = Date.now();
		this.log('Session created');
	}

	getContext(): SessionContext {
		return this.context;
	}

	getMessages(): AssistantMessage[] {
		return this.messages;
	}

	log(message: string): void {
		this.debugLogs.push(`${Date.now() - this.startTime}ms: ${message}`);
	}

	setAIMetrics(
		responseTime: number,
		tokenUsage: SessionMetrics['tokenUsage']
	): void {
		this.metrics.aiResponseTime = responseTime;
		this.metrics.tokenUsage = tokenUsage;
		this.log(
			`AI completed in ${responseTime}ms, tokens: ${tokenUsage.totalTokens}`
		);
	}

	finalize(): SessionMetrics {
		const totalTime = Date.now() - this.startTime;
		this.metrics.totalProcessingTime = totalTime;
		this.log(`Session completed in ${totalTime}ms`);

		return {
			aiResponseTime: this.metrics.aiResponseTime || 0,
			totalProcessingTime: totalTime,
			tokenUsage: this.metrics.tokenUsage || {
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
			},
		};
	}

	getDebugLogs(): string[] {
		return [...this.debugLogs];
	}

	addMessage(message: AssistantMessage): void {
		this.messages.push(message);
		this.log(`Added ${message.role} message`);
	}
}
