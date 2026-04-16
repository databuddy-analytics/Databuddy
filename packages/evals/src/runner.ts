import type { EvalCase, EvalConfig, ParsedAgentResponse } from "./types";

/**
 * Execute a single eval case against the live agent API.
 * Streams the response and parses tool calls, text, and chart JSON.
 */
export async function runCase(
	evalCase: EvalCase,
	config: EvalConfig
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

	const raw = await response.text();
	const latencyMs = Date.now() - startTime;

	return parseSSE(raw, latencyMs);
}

interface SSEEvent {
	type: string;
	[key: string]: unknown;
}

/**
 * Parse the SSE stream into structured data by processing each `data:` line.
 */
function parseSSE(raw: string, latencyMs: number): ParsedAgentResponse {
	const lines = raw.split("\n");
	const events: SSEEvent[] = [];

	for (const line of lines) {
		if (!line.startsWith("data: ")) {
			continue;
		}
		const payload = line.slice(6).trim();
		if (payload === "[DONE]") {
			break;
		}
		try {
			events.push(JSON.parse(payload) as SSEEvent);
		} catch {
			// skip unparseable lines
		}
	}

	// Extract tool calls from tool-input-available events
	const toolCalls: ParsedAgentResponse["toolCalls"] = [];
	const toolNames = new Set<string>();
	for (const evt of events) {
		if (
			evt.type === "tool-input-available" &&
			typeof evt.toolName === "string" &&
			!toolNames.has(evt.toolName)
		) {
			toolNames.add(evt.toolName);
			toolCalls.push({
				name: evt.toolName,
				input: evt.input ?? null,
				output: null,
			});
		}
		// Attach output to matching tool call
		if (
			evt.type === "tool-output-available" &&
			typeof evt.toolCallId === "string"
		) {
			const tc = toolCalls.find(
				(t) => t.output === null // first tool without output
			);
			if (tc) {
				tc.output = evt.output ?? null;
			}
		}
	}

	// Extract text content from text-delta events
	let textContent = "";
	for (const evt of events) {
		if (evt.type === "text-delta" && typeof evt.delta === "string") {
			textContent += evt.delta;
		}
	}

	// Extract chart/component JSONs from assembled text
	const chartJSONs: ParsedAgentResponse["chartJSONs"] = [];
	const rawJSONLeaks: string[] = [];

	// Find JSON objects in the text by matching {"type":"...
	const _jsonPattern = /\{"type":"[\w-]+"[^.]*?\n/g;
	let _match: RegExpExecArray | null;

	// Better approach: find all {"type":" starts, then brace-count to close
	let searchIdx = 0;
	while (searchIdx < textContent.length) {
		const start = textContent.indexOf('{"type":"', searchIdx);
		if (start === -1) {
			break;
		}

		// Brace-count to find closing
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
				chartJSONs.push({
					type: parsed.type,
					raw: jsonStr,
					parsed,
				});
			}
		} catch {
			rawJSONLeaks.push(jsonStr.slice(0, 100));
		}

		searchIdx = end + 1;
	}

	// Count steps from start-step events
	const steps = events.filter((e) => e.type === "start-step").length;

	return {
		textContent,
		toolCalls,
		chartJSONs,
		rawJSONLeaks,
		steps,
		latencyMs,
	};
}
