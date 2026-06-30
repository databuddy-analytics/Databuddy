import { generateText } from "ai";
import { createModelFromId, modelNames } from "../config/models";

const BANNED_OPENINGS = [
	"sure",
	"got it",
	"done!",
	"done.",
	"great",
	"perfect",
	"here's",
	"here is",
	"thinking",
	"i've routed",
	"i've set up",
	"i've configured",
	"i have routed",
	"i have set up",
	"i have configured",
	"let me",
	"i'll",
	"i will",
	"okay",
	"ok ",
] as const;

const RAW_CHANNEL_ID_RE = /\b[CGD][A-Z0-9]{8,}\b/g;
const VALID_MENTION_PREFIX = "<#";

export interface ReplyValidationResult {
	issues: ReplyValidationIssue[];
	valid: boolean;
}

export interface ReplyValidationIssue {
	code: "banned_opening" | "raw_channel_id";
	detail: string;
}

export function validateSlackReply(text: string): ReplyValidationResult {
	const issues: ReplyValidationIssue[] = [];
	const trimmed = text.trim();
	if (!trimmed) {
		return { issues, valid: true };
	}

	const opening = trimmed.toLowerCase();
	for (const banned of BANNED_OPENINGS) {
		if (opening.startsWith(banned)) {
			issues.push({
				code: "banned_opening",
				detail: `Reply opens with "${trimmed.slice(0, banned.length)}". Forbidden opening — lead with the receipt itself.`,
			});
			break;
		}
	}

	const seen = new Set<string>();
	for (const match of trimmed.matchAll(RAW_CHANNEL_ID_RE)) {
		const id = match[0];
		if (seen.has(id)) {
			continue;
		}
		seen.add(id);
		const index = match.index ?? 0;
		const prefix = trimmed.slice(Math.max(0, index - 2), index);
		if (prefix === VALID_MENTION_PREFIX) {
			continue;
		}
		issues.push({
			code: "raw_channel_id",
			detail: `Reply contains raw channel ID "${id}". Must be rendered as <#${id}> so Slack shows a clickable channel link.`,
		});
	}

	return { issues, valid: issues.length === 0 };
}

const REVISOR_SYSTEM_PROMPT = `You are revising a Slack reply that failed validation.

Rules:
- Fix ONLY the listed violations.
- Preserve all other content, structure, numbers, channel mentions, and tone.
- Output the corrected reply text only. No preamble, no explanation, no quotes.
- Lead with the receipt itself. Never start with "Sure", "Got it", "Done!", "Done.", "Great", "Perfect", "Here's", "Thinking", "I've routed", "I've set up", "I've configured", "Let me", "I'll".
- Slack channel mentions must EXACTLY MATCH <#CHANNELID> — angle brackets, hash, no space.`;

const REPAIR_MAX_OUTPUT_TOKENS = 512;
const REPAIR_TEMPERATURE = 0;

export interface RepairOptions {
	abortSignal?: AbortSignal;
	draft: string;
	issues: ReplyValidationIssue[];
	modelId?: string;
}

export async function repairSlackReply(
	options: RepairOptions
): Promise<string> {
	const violations = options.issues
		.map((issue) => `- ${issue.detail}`)
		.join("\n");
	const prompt = `<draft>
${options.draft}
</draft>

<violations>
${violations}
</violations>

Re-emit the reply with the violations fixed. Use ONLY content already present in the draft — do not add new facts.`;

	const result = await generateText({
		abortSignal: options.abortSignal,
		maxOutputTokens: REPAIR_MAX_OUTPUT_TOKENS,
		model: createModelFromId(options.modelId ?? modelNames.balanced),
		prompt,
		system: REVISOR_SYSTEM_PROMPT,
		temperature: REPAIR_TEMPERATURE,
	});

	return result.text.trim();
}
