#!/usr/bin/env bun
/**
 * Standalone cost probe for the analytics agent.
 *
 * Usage:
 *   cd apps/api
 *   PROBE_WEBSITE_ID=... PROBE_USER_ID=... \
 *     dotenv -e ../../.env -- bun run scripts/agent-cost-probe.ts \
 *       [--thinking=off|low|medium|high] "msg 1" ["msg 2" ...]
 *
 * Runs one or more turns through the real agent pipeline (same model,
 * same system prompt, same tools, same provider options) and prints:
 *   - Per-turn token breakdown (fresh / read / write / output / reasoning)
 *   - Per-turn credit cost under both the current and a proposed schema
 *   - Chat-wide totals so you can amortize cache writes across turns
 *
 * Multiple messages are sent sequentially through the same chat id so
 * cache hits/misses are realistic.
 */

import { randomUUIDv7 } from "bun";
import { convertToModelMessages, ToolLoopAgent, type UIMessage } from "ai";
import { createAgentConfig } from "../src/ai/agents";
import {
	AGENT_THINKING_LEVELS,
	type AgentThinking,
} from "../src/ai/agents/types";
import { modelNames } from "../src/ai/config/models";
import { AI_MODEL_MAX_RETRIES } from "../src/ai/config/retry";
import { summarizeAgentUsage } from "../src/lib/usage-telemetry";

const rawArgs = process.argv.slice(2);
let thinking: AgentThinking = "off";
const messages: string[] = [];
for (const arg of rawArgs) {
	if (arg.startsWith("--thinking=")) {
		const value = arg.slice("--thinking=".length);
		if ((AGENT_THINKING_LEVELS as readonly string[]).includes(value)) {
			thinking = value as AgentThinking;
		}
		continue;
	}
	messages.push(arg);
}
if (messages.length === 0) {
	console.error(
		'Usage: bun run scripts/agent-cost-probe.ts [--thinking=off|low|medium|high] "msg 1" ["msg 2" ...]'
	);
	process.exit(1);
}

const websiteId = process.env.PROBE_WEBSITE_ID;
const userId = process.env.PROBE_USER_ID;
if (!(websiteId && userId)) {
	console.error(
		"Set PROBE_WEBSITE_ID and PROBE_USER_ID env vars (real ids from your DB)."
	);
	process.exit(1);
}

const CURRENT_SCHEMA = {
	input: 0.000_72,
	output: 0.0036,
	cacheRead: 0.000_072,
	cacheWrite: 0.001_44,
};

function computeCredits(
	schema: typeof CURRENT_SCHEMA,
	s: ReturnType<typeof summarizeAgentUsage>
): number {
	return (
		s.fresh_input_tokens * schema.input +
		s.output_tokens * schema.output +
		s.cache_read_tokens * schema.cacheRead +
		s.cache_write_tokens * schema.cacheWrite
	);
}

async function main() {
	const chatId = `probe-${randomUUIDv7()}`;
	console.log("━".repeat(70));
	console.log(
		`Probe chat: ${chatId} · ${messages.length} turn(s) · thinking=${thinking}`
	);
	console.log("━".repeat(70));

	const config = createAgentConfig({
		userId,
		websiteId,
		websiteDomain: "probe.example.com",
		timezone: "UTC",
		chatId,
		thinking,
	});

	// Anthropic rejects `temperature` when extended thinking is enabled —
	// match the production route's behaviour.
	const thinkingEnabled = Boolean(config.providerOptions);
	const agent = new ToolLoopAgent({
		model: config.model,
		instructions: config.system,
		tools: config.tools,
		stopWhen: config.stopWhen,
		temperature: thinkingEnabled ? undefined : config.temperature,
		maxRetries: AI_MODEL_MAX_RETRIES,
		experimental_context: config.experimental_context,
		providerOptions: config.providerOptions,
	});

	const uiMessages: UIMessage[] = [];
	const totals = {
		credits: 0,
		fresh: 0,
		read: 0,
		write: 0,
		output: 0,
	};

	for (const [idx, message] of messages.entries()) {
		console.log();
		console.log(`Turn ${idx + 1}: "${message}"`);
		console.log("─".repeat(70));
		const t0 = Date.now();

		uiMessages.push({
			id: randomUUIDv7(),
			role: "user",
			parts: [{ type: "text", text: message }],
		});

		const modelMessages = await convertToModelMessages(uiMessages, {
			tools: config.tools,
			ignoreIncompleteToolCalls: true,
		});

		const result = await agent.stream({
			messages: modelMessages,
			options: undefined,
		});

		let assistantText = "";
		let toolCalls = 0;
		for await (const part of result.fullStream) {
			if (part.type === "text-delta") {
				assistantText += part.text ?? "";
			} else if (part.type === "tool-call") {
				toolCalls++;
				console.log(`  → tool call: ${part.toolName}`);
			}
		}

		uiMessages.push({
			id: randomUUIDv7(),
			role: "assistant",
			parts: [{ type: "text", text: assistantText }],
		});

		const usage = await result.totalUsage;
		const steps = (await result.steps).length;
		const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
		const summary = summarizeAgentUsage(modelNames.analytics, usage);
		const credits = computeCredits(CURRENT_SCHEMA, summary);

		totals.credits += credits;
		totals.fresh += summary.fresh_input_tokens;
		totals.read += summary.cache_read_tokens;
		totals.write += summary.cache_write_tokens;
		totals.output += summary.output_tokens;

		console.log(
			`  ${elapsed}s · ${steps} steps · ${toolCalls} tools · fresh ${summary.fresh_input_tokens} · read ${summary.cache_read_tokens} · write ${summary.cache_write_tokens} · out ${summary.output_tokens}${
				summary.reasoning_tokens > 0
					? ` (${summary.reasoning_tokens} reasoning)`
					: ""
			}`
		);
		console.log(`  credits: ${credits.toFixed(2)}`);
	}

	const avgCreditsPerTurn = totals.credits / messages.length;

	console.log();
	console.log("━".repeat(70));
	console.log("Chat totals:");
	console.log(`  fresh in     ${totals.fresh.toLocaleString().padStart(10)}`);
	console.log(`  cache read   ${totals.read.toLocaleString().padStart(10)}`);
	console.log(`  cache write  ${totals.write.toLocaleString().padStart(10)}`);
	console.log(`  output       ${totals.output.toLocaleString().padStart(10)}`);
	console.log(`  credits      ${totals.credits.toFixed(2).padStart(10)}`);
	console.log();
	console.log(
		`Runway: free 500 → ${(500 / avgCreditsPerTurn).toFixed(0)} turns · hobby 2500 → ${(2500 / avgCreditsPerTurn).toFixed(0)} · pro 25000 → ${(25_000 / avgCreditsPerTurn).toFixed(0)}`
	);
	console.log("━".repeat(70));
}

main().catch((error) => {
	console.error("Probe failed:", error);
	process.exit(1);
});
