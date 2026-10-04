import { isToolUIPart, ToolLoopAgent, type UIMessage } from "ai";
import { AI_MODEL_MAX_RETRIES, ANTHROPIC_CACHE_1H } from "../config/models";
import { MAX_AGENT_STEPS } from "./stop-conditions";
import type { AgentConfig } from "./types";

type ConversationCallbacks = Pick<
	ConstructorParameters<typeof ToolLoopAgent>[0],
	"experimental_telemetry" | "onStepFinish"
>;

type MessagePart = UIMessage["parts"][number];

const UNANSWERED_APPROVAL_REASON = "The user did not approve this action.";
const UNRECORDED_APPROVAL_ERROR =
	"The user approved this action, but no result was recorded. Check whether it ran before retrying.";

function settleApproval(part: MessagePart, isLatest: boolean): MessagePart {
	if (!isToolUIPart(part)) {
		return part;
	}
	if (part.state === "approval-requested") {
		return {
			...part,
			state: "output-denied",
			approval: {
				id: part.approval.id,
				approved: false,
				reason: UNANSWERED_APPROVAL_REASON,
			},
		};
	}
	if (part.state !== "approval-responded" || isLatest) {
		return part;
	}
	if (part.approval.approved) {
		return {
			...part,
			state: "output-error",
			errorText: UNRECORDED_APPROVAL_ERROR,
			approval: { id: part.approval.id, approved: true },
		};
	}
	return {
		...part,
		state: "output-denied",
		approval: { ...part.approval, approved: false },
	};
}

export function settleStaleToolApprovals(messages: UIMessage[]): UIMessage[] {
	return messages.map((message, index) => ({
		...message,
		parts: message.parts.map((part) =>
			settleApproval(part, index === messages.length - 1)
		),
	}));
}

export function createConversationAgent(
	config: AgentConfig,
	callbacks: ConversationCallbacks = {}
) {
	return new ToolLoopAgent({
		model: config.model,
		instructions: config.system,
		tools: config.tools,
		activeTools: config.activeTools,
		stopWhen: config.stopWhen,
		temperature: config.temperature,
		providerOptions: config.providerOptions,
		maxRetries: AI_MODEL_MAX_RETRIES,
		experimental_context: config.experimental_context,
		...callbacks,
		prepareStep({ messages, stepNumber }) {
			const toolChoice = stepNumber >= MAX_AGENT_STEPS - 1 ? "none" : undefined;
			const last = messages.at(-1);
			if (
				config.model.modelId.startsWith("anthropic/") &&
				last?.role === "user" &&
				!last.providerOptions
			) {
				return {
					messages: [
						...messages.slice(0, -1),
						{ ...last, providerOptions: ANTHROPIC_CACHE_1H },
					],
					toolChoice,
				};
			}
			return { messages, toolChoice };
		},
	});
}
