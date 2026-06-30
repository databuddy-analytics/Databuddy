import type {
	EvalCase,
	EvalConfig,
	EvalSurface,
	ParsedAgentResponse,
	SlackEvalMessage,
	ToolCallRecord,
} from "./types";

type PackageAgentSource = "dashboard" | "mcp" | "slack";

export type ProgressEvent =
	| { kind: "step"; step: number }
	| { kind: "tool"; name: string; index: number }
	| { kind: "text"; chars: number }
	| { kind: "done" };

export function runCase(
	evalCase: EvalCase,
	config: EvalConfig,
	onProgress?: (evt: ProgressEvent) => void
): Promise<ParsedAgentResponse> {
	if (config.runner === "package") {
		return runPackageCase(evalCase, config, onProgress);
	}
	return runApiCase(evalCase, config, onProgress);
}

async function runApiCase(
	evalCase: EvalCase,
	config: EvalConfig,
	onProgress?: (evt: ProgressEvent) => void
): Promise<ParsedAgentResponse> {
	const startTime = Date.now();

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (config.authCookie) {
		headers.Cookie = config.authCookie;
	}
	if (config.apiKey) {
		headers["x-api-key"] = config.apiKey;
	}
	if (config.modelOverride) {
		headers["x-model-override"] = config.modelOverride;
	}

	const body = JSON.stringify({
		websiteId: evalCase.websiteId,
		id: `eval-${evalCase.id}-${Date.now()}`,
		timezone: "UTC",
		messages: [
			{
				id: `msg-${Date.now()}`,
				role: "user",
				parts: [{ type: "text", text: evalCase.query }],
			},
		],
	});

	const response = await fetch(`${config.apiUrl}/v1/agent/chat`, {
		method: "POST",
		headers,
		body,
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Agent API error ${response.status}: ${errorText}`);
	}

	return streamSSE(response, startTime, onProgress);
}

async function runPackageCase(
	evalCase: EvalCase,
	config: EvalConfig,
	onProgress?: (evt: ProgressEvent) => void
): Promise<ParsedAgentResponse> {
	if (!config.apiKey) {
		throw new Error("Package runner requires EVAL_API_KEY.");
	}

	const startTime = Date.now();
	const prepared = await preparePackageCase(evalCase, config);
	const { traceDatabuddyAgent } = await import("@databuddy/ai/agent");
	const result = await traceDatabuddyAgent({
		actor: {
			secret: config.apiKey,
			type: "api_key_secret",
			userId: null,
		},
		billingMode: "skip",
		conversationId: prepared.conversationId,
		input: prepared.input,
		memoryUserId: prepared.memoryUserId,
		modelOverride: config.modelOverride,
		mutationMode: "dry-run",
		persistConversation: false,
		slackContext: prepared.slackContext,
		source: prepared.source,
		timeoutMs: evalCase.expect.maxLatencyMs
			? Math.max(evalCase.expect.maxLatencyMs, 45_000)
			: undefined,
		timezone: "UTC",
		websiteId: evalCase.websiteId,
	});

	for (let step = 1; step <= result.steps; step++) {
		onProgress?.({ kind: "step", step });
	}
	for (const call of result.toolCalls) {
		onProgress?.({ kind: "tool", name: call.name, index: call.index });
	}
	onProgress?.({ kind: "text", chars: result.answer.length });
	onProgress?.({ kind: "done" });

	return {
		textContent: result.answer,
		toolCalls: result.toolCalls,
		...extractChartJSONs(result.answer),
		steps: result.steps,
		latencyMs: Date.now() - startTime,
		inputTokens: result.usage.inputTokens,
		outputTokens: result.usage.outputTokens,
	};
}

async function preparePackageCase(evalCase: EvalCase, config: EvalConfig) {
	const source = getAgentSource(evalCase, config.surface);
	if (!(source === "slack" && evalCase.slack)) {
		return {
			conversationId: `eval-${source}-${evalCase.id}-${Date.now()}`,
			input: evalCase.query,
			memoryUserId: undefined,
			slackContext: undefined,
			source,
		};
	}

	const {
		createSlackConversationId,
		createSlackMemoryUserId,
		formatSlackAgentInput,
	} = await import("../../../apps/slack/src/agent/agent-client");
	const slack = evalCase.slack;
	const threadTs = slack.threadTs ?? "1778005033.664559";
	const messageTs = slack.messageTs ?? nextSlackTs(threadTs, 99);
	const run = {
		channelId: slack.channelId ?? "C0EVALTHRD",
		followUpMessages: slack.followUpMessages,
		messageTs,
		teamId: slack.teamId ?? "T_EVAL",
		text: evalCase.query,
		threadTs,
		trigger: slack.trigger ?? "thread_follow_up",
		userId: slack.currentUserId,
	};
	const threadMessages = withCurrentSlackMessage(
		slack.threadMessages ?? [],
		run
	);
	const recentChannelMessages =
		slack.recentChannelMessages && slack.recentChannelMessages.length > 0
			? slack.recentChannelMessages
			: threadMessages;

	return {
		conversationId: createSlackConversationId(run),
		input: formatSlackAgentInput(run),
		memoryUserId: createSlackMemoryUserId(run),
		slackContext: {
			readCurrentThread: async () => ({
				channelId: run.channelId,
				hasMore: false,
				messages: threadMessages,
				threadTs,
			}),
			readRecentChannelMessages: async ({ limit }: { limit?: number }) => ({
				channelId: run.channelId,
				hasMore: false,
				messages: recentChannelMessages.slice(-(limit ?? 20)),
			}),
		},
		source,
	};
}

function withCurrentSlackMessage(
	messages: SlackEvalMessage[],
	run: {
		messageTs?: string;
		text: string;
		threadTs?: string;
		userId: string;
	}
): SlackEvalMessage[] {
	const currentTs = run.messageTs ?? nextSlackTs(run.threadTs ?? "1", 99);
	if (
		messages.some(
			(message) => message.ts === currentTs || message.text === run.text
		)
	) {
		return messages;
	}
	return [
		...messages,
		{
			text: run.text,
			threadTs: run.threadTs,
			ts: currentTs,
			userId: run.userId,
		},
	];
}

function nextSlackTs(threadTs: string, offset: number): string {
	const [seconds = "1778005033", micros = "000000"] = threadTs.split(".");
	return `${seconds}.${String(Number(micros) + offset).padStart(6, "0")}`;
}

function getAgentSource(
	evalCase: EvalCase,
	selectedSurface: EvalSurface | "all" | undefined
): PackageAgentSource {
	const surface =
		selectedSurface && selectedSurface !== "all"
			? selectedSurface
			: (evalCase.surfaces?.[0] ?? "agent");
	return surface === "agent" ? "dashboard" : surface;
}

async function streamSSE(
	response: Response,
	startTime: number,
	onProgress?: (evt: ProgressEvent) => void
): Promise<ParsedAgentResponse> {
	const toolCalls: ToolCallRecord[] = [];
	let pendingToolCall: Omit<ToolCallRecord, "output"> | null = null;
	let textContent = "";
	let inputTokens = 0;
	let outputTokens = 0;
	let steps = 0;

	if (!response.body) {
		throw new Error("Agent API response did not include a body");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buf = "";

	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		buf += decoder.decode(value, { stream: true });

		let newlineIdx = buf.indexOf("\n");
		while (newlineIdx !== -1) {
			const line = buf.slice(0, newlineIdx);
			buf = buf.slice(newlineIdx + 1);

			if (!line.startsWith("data: ")) {
				newlineIdx = buf.indexOf("\n");
				continue;
			}
			const payload = line.slice(6).trim();
			if (payload === "[DONE]") {
				onProgress?.({ kind: "done" });
				break;
			}

			let evt: Record<string, unknown>;
			try {
				evt = JSON.parse(payload);
			} catch {
				newlineIdx = buf.indexOf("\n");
				continue;
			}

			switch (evt.type) {
				case "tool-input-available":
					if (typeof evt.toolName === "string") {
						if (pendingToolCall) {
							toolCalls.push({ ...pendingToolCall, output: null });
						}
						pendingToolCall = {
							index: toolCalls.length,
							name: evt.toolName,
							input: evt.input ?? null,
						};
						onProgress?.({
							kind: "tool",
							name: evt.toolName,
							index: toolCalls.length,
						});
					}
					break;
				case "tool-output-available":
					if (pendingToolCall) {
						toolCalls.push({
							...pendingToolCall,
							output: evt.output ?? null,
						});
						pendingToolCall = null;
					}
					break;
				case "text-delta":
				case "content-delta":
					if (typeof evt.delta === "string") {
						textContent += evt.delta;
						onProgress?.({ kind: "text", chars: textContent.length });
					}
					break;
				case "step-finish":
				case "finish-step":
					if (evt.usage) {
						const u = evt.usage as Record<string, number>;
						const iT = u.inputTokens ?? u.prompt_tokens ?? 0;
						const oT = u.outputTokens ?? u.completion_tokens ?? 0;
						if (iT > 0) {
							inputTokens += iT;
						}
						if (oT > 0) {
							outputTokens += oT;
						}
					}
					break;
				case "usage": {
					const u = evt as Record<string, number>;
					const iT = u.inputTokens ?? u.prompt_tokens ?? 0;
					const oT = u.outputTokens ?? u.completion_tokens ?? 0;
					if (iT > 0) {
						inputTokens = iT;
					}
					if (oT > 0) {
						outputTokens = oT;
					}
					break;
				}
				case "finish":
					if (evt.usage && inputTokens === 0) {
						const u = evt.usage as Record<string, number>;
						inputTokens = u.inputTokens ?? u.prompt_tokens ?? 0;
						outputTokens = u.outputTokens ?? u.completion_tokens ?? 0;
					}
					break;
				case "start-step":
					steps++;
					onProgress?.({ kind: "step", step: steps });
					break;
				default:
					break;
			}
			newlineIdx = buf.indexOf("\n");
		}
	}

	if (pendingToolCall) {
		toolCalls.push({ ...pendingToolCall, output: null });
	}

	const latencyMs = Date.now() - startTime;

	const { chartJSONs, rawJSONLeaks } = extractChartJSONs(textContent);

	return {
		textContent,
		toolCalls,
		chartJSONs,
		rawJSONLeaks,
		steps,
		latencyMs,
		inputTokens,
		outputTokens,
	};
}

function extractChartJSONs(
	textContent: string
): Pick<ParsedAgentResponse, "chartJSONs" | "rawJSONLeaks"> {
	const chartJSONs: ParsedAgentResponse["chartJSONs"] = [];
	const rawJSONLeaks: string[] = [];
	let searchIdx = 0;
	while (searchIdx < textContent.length) {
		const start = textContent.indexOf('{"type":"', searchIdx);
		if (start === -1) {
			break;
		}

		let depth = 0;
		let end = -1;
		for (let i = start; i < textContent.length; i++) {
			if (textContent[i] === "{") {
				depth++;
			} else if (textContent[i] === "}") {
				depth--;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}
		if (end === -1) {
			break;
		}

		const jsonStr = textContent.slice(start, end + 1);
		try {
			const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
			if (typeof parsed.type === "string") {
				chartJSONs.push({ type: parsed.type, raw: jsonStr, parsed });
			}
		} catch {
			rawJSONLeaks.push(jsonStr.slice(0, 100));
		}
		searchIdx = end + 1;
	}

	return {
		chartJSONs,
		rawJSONLeaks,
	};
}
