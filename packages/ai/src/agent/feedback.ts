import { trackAgentEvent } from "../lib/databuddy";
import { mergeWideEvent } from "../lib/tracing";
import type { DatabuddyAgentSource } from ".";

const POSITIVE_SIGNALS = new Set([
	"+1",
	"thumbsup",
	"white_check_mark",
	"heavy_check_mark",
	"heart",
	"green_heart",
	"blue_heart",
	"raised_hands",
	"clap",
	"tada",
	"fire",
	"rocket",
]);

const NEGATIVE_SIGNALS = new Set([
	"-1",
	"thumbsdown",
	"x",
	"heavy_multiplication_x",
	"confused",
	"face_with_raised_eyebrow",
	"warning",
	"rotating_light",
	"broken_heart",
]);

export type AgentFeedbackAction = "added" | "removed";
export type AgentFeedbackSentiment = "positive" | "negative" | "neutral";

export interface AgentFeedbackInput {
	action: AgentFeedbackAction;
	conversationId?: string | null;
	integrationId?: string | null;
	organizationId?: string | null;
	responseId?: string | null;
	signal: string;
	source: DatabuddyAgentSource;
	sourceEventId?: string | null;
	targetId?: string | null;
	userId?: string | null;
}

export interface AgentFeedbackEvent {
	action: AgentFeedbackAction;
	explicit: boolean;
	integrationId: string | null;
	organizationId: string | null;
	sentiment: AgentFeedbackSentiment;
	signal: string;
	source: DatabuddyAgentSource;
	userId: string | null;
	wideEvent: Record<string, string | number | boolean>;
}

export function normalizeAgentFeedbackSignal(signal: string): string {
	let start = 0;
	let end = signal.length;
	while (start < end && signal[start] === ":") {
		start++;
	}
	while (end > start && signal[end - 1] === ":") {
		end--;
	}
	return signal.slice(start, end).toLowerCase();
}

export function classifyAgentFeedbackSentiment(
	signal: string
): AgentFeedbackSentiment {
	const normalized = normalizeAgentFeedbackSignal(signal);
	if (POSITIVE_SIGNALS.has(normalized)) {
		return "positive";
	}
	if (NEGATIVE_SIGNALS.has(normalized)) {
		return "negative";
	}
	return "neutral";
}

export function recordAgentFeedback(
	input: AgentFeedbackInput
): AgentFeedbackEvent {
	const signal = normalizeAgentFeedbackSignal(input.signal);
	const sentiment = classifyAgentFeedbackSentiment(signal);
	const event: AgentFeedbackEvent = {
		action: input.action,
		explicit: sentiment !== "neutral",
		integrationId: input.integrationId ?? null,
		organizationId: input.organizationId ?? null,
		sentiment,
		signal,
		source: input.source,
		userId: input.userId ?? null,
		wideEvent: buildFeedbackWideEvent(input, signal, sentiment),
	};

	mergeWideEvent(event.wideEvent);
	trackAgentEvent("agent_feedback", {
		action: event.action,
		conversation_id: input.conversationId ?? null,
		explicit: event.explicit,
		integration_id: event.integrationId,
		organization_id: event.organizationId,
		response_id: input.responseId ?? null,
		sentiment: event.sentiment,
		signal: event.signal,
		source: event.source,
		source_event_id: input.sourceEventId ?? null,
		target_id: input.targetId ?? null,
		user_id: event.userId,
	});

	return event;
}

function buildFeedbackWideEvent(
	input: AgentFeedbackInput,
	signal: string,
	sentiment: AgentFeedbackSentiment
): Record<string, string | number | boolean> {
	return {
		agent_feedback_action: input.action,
		agent_feedback_explicit: sentiment !== "neutral",
		agent_feedback_sentiment: sentiment,
		agent_feedback_signal: signal,
		agent_feedback_source: input.source,
		...(input.conversationId
			? { agent_feedback_conversation_id: input.conversationId }
			: {}),
		...(input.integrationId
			? { agent_feedback_integration_id: input.integrationId }
			: {}),
		...(input.organizationId ? { organization_id: input.organizationId } : {}),
		...(input.responseId
			? { agent_feedback_response_id: input.responseId }
			: {}),
		...(input.sourceEventId
			? { agent_feedback_source_event_id: input.sourceEventId }
			: {}),
		...(input.targetId ? { agent_feedback_target_id: input.targetId } : {}),
		...(input.userId ? { agent_feedback_user_id: input.userId } : {}),
	};
}
