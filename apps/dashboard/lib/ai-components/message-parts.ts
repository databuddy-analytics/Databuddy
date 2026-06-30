import { parseContentSegments } from "./parser";
import { validateComponentJSON } from "./schemas";
import type { RawComponentInput } from "./types";

export const AI_COMPONENT_DATA_PART_NAME = "aiComponent";
export const AI_COMPONENT_DATA_PART_TYPE = `data-${AI_COMPONENT_DATA_PART_NAME}`;

interface MessageLike {
	parts: unknown[];
	role?: string;
}

interface TextPartLike {
	text: string;
	type: "text";
	[key: string]: unknown;
}

export interface AIComponentDataPart {
	data: RawComponentInput;
	id?: string;
	type: typeof AI_COMPONENT_DATA_PART_TYPE;
}

const LEGACY_AI_COMPONENT_DATA_PART_TYPE = "data-ai-component";
const COMPONENT_JSON_MARKER = '{"type":"';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isTextPart(part: unknown): part is TextPartLike {
	return (
		isRecord(part) && part.type === "text" && typeof part.text === "string"
	);
}

function isSupportedAIComponentPartType(type: unknown): boolean {
	return (
		type === AI_COMPONENT_DATA_PART_TYPE ||
		type === LEGACY_AI_COMPONENT_DATA_PART_TYPE
	);
}

export function getAIComponentInputFromPart(
	part: unknown
): RawComponentInput | null {
	if (!(isRecord(part) && isSupportedAIComponentPartType(part.type))) {
		return null;
	}

	const { data } = part;
	const validation = validateComponentJSON(data);
	if (!validation.valid) {
		return null;
	}
	return data as RawComponentInput;
}

export function getAIComponentInputFromToolOutput(
	part: unknown
): RawComponentInput | null {
	if (!(isRecord(part) && typeof part.type === "string")) {
		return null;
	}
	if (!(part.type.startsWith("tool-") && "output" in part)) {
		return null;
	}

	const validation = validateComponentJSON(part.output);
	if (!validation.valid) {
		return null;
	}
	return part.output as RawComponentInput;
}

function createAIComponentDataPart(
	input: RawComponentInput
): AIComponentDataPart {
	return {
		type: AI_COMPONENT_DATA_PART_TYPE,
		data: input,
	};
}

function expandTextPart(part: TextPartLike): unknown[] | null {
	if (!part.text.includes(COMPONENT_JSON_MARKER)) {
		return null;
	}

	const { segments } = parseContentSegments(part.text);
	if (!segments.some((segment) => segment.type === "component")) {
		return null;
	}

	const expanded: unknown[] = [];
	for (const segment of segments) {
		if (segment.type === "text") {
			expanded.push({ ...part, text: segment.content });
			continue;
		}
		if (segment.type === "component") {
			expanded.push(createAIComponentDataPart(segment.content));
		}
	}

	return expanded.length > 0 ? expanded : null;
}

export function normalizeAIComponentMessageParts<TMessage extends MessageLike>(
	message: TMessage
): TMessage {
	if (message.role !== "assistant") {
		return message;
	}

	let didChange = false;
	const nextParts: unknown[] = [];

	for (const part of message.parts) {
		if (!isTextPart(part)) {
			nextParts.push(part);
			continue;
		}

		const expanded = expandTextPart(part);
		if (!expanded) {
			nextParts.push(part);
			continue;
		}

		didChange = true;
		nextParts.push(...expanded);
	}

	if (!didChange) {
		return message;
	}

	return {
		...message,
		parts: nextParts,
	};
}

export function normalizeAIComponentMessages<TMessage extends MessageLike>(
	messages: TMessage[]
): TMessage[] {
	let didChange = false;
	const nextMessages = messages.map((message) => {
		const normalized = normalizeAIComponentMessageParts(message);
		if (normalized !== message) {
			didChange = true;
		}
		return normalized;
	});

	return didChange ? nextMessages : messages;
}
