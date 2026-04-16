import { hasComponent } from "./registry";
import { validateComponentJSON } from "./schemas";
import type {
	ContentSegment,
	ParsedSegments,
	RawComponentInput,
} from "./types";

const COMPONENT_START = '{"type":"';

const TRAILING_COMMA_RE = /,\s*$/;
const DANGLING_KEY_TEST_RE = /,\s*"[^"]*"\s*$/;
const DANGLING_KV_TEST_RE = /,\s*"[^"]*"\s*:\s*$/;
const DANGLING_KV_REPLACE_RE = /,\s*"[^"]*"(\s*:\s*[^,}\]]*?)?\s*$/;

function isRawComponentInput(obj: unknown): obj is RawComponentInput {
	if (typeof obj !== "object" || obj === null) {
		return false;
	}
	const record = obj as Record<string, unknown>;
	if (typeof record.type !== "string" || !hasComponent(record.type)) {
		return false;
	}
	const { valid } = validateComponentJSON(obj);
	return valid;
}

export function repairPartialJSON(input: string): string | null {
	if (input.length < 10) {
		return null;
	}

	let result = input;
	result = result.replace(TRAILING_COMMA_RE, "");

	let inString = false;
	let escaped = false;
	const stack: string[] = [];

	for (const ch of result) {
		if (escaped) {
			escaped = false;
			continue;
		}

		if (ch === "\\") {
			escaped = true;
			continue;
		}

		if (ch === '"') {
			if (inString) {
				inString = false;
			} else {
				inString = true;
			}
			continue;
		}

		if (inString) {
			continue;
		}

		if (ch === "{") {
			stack.push("}");
		} else if (ch === "[") {
			stack.push("]");
		} else if (ch === "}" || ch === "]") {
			stack.pop();
		}
	}

	if (inString) {
		result += '"';
	}

	// Drop dangling key-value pair before the current open object closes.
	// e.g. {"type":"line-chart","tit  ->  {"type":"line-chart"
	const lastBrace = result.lastIndexOf("{");
	if (stack.length > 0 && stack.at(-1) === "}") {
		const afterLastBrace = result.slice(lastBrace);
		if (
			DANGLING_KEY_TEST_RE.test(afterLastBrace) ||
			DANGLING_KV_TEST_RE.test(afterLastBrace)
		) {
			result = result.replace(DANGLING_KV_REPLACE_RE, "");
		}
	}

	// Trailing commas may have been exposed by closing an unterminated string.
	result = result.replace(TRAILING_COMMA_RE, "");

	while (stack.length > 0) {
		result += stack.pop();
	}

	try {
		JSON.parse(result);
		return result;
	} catch {
		return null;
	}
}

export function parseContentSegments(content: string): ParsedSegments {
	const segments: ContentSegment[] = [];
	let searchIndex = 0;

	while (searchIndex < content.length) {
		const startIndex = content.indexOf(COMPONENT_START, searchIndex);

		if (startIndex === -1) {
			const remainingText = content.slice(searchIndex).trim();
			if (remainingText) {
				segments.push({ type: "text", content: remainingText });
			}
			break;
		}

		const textBefore = content.slice(searchIndex, startIndex).trim();
		if (textBefore) {
			segments.push({ type: "text", content: textBefore });
		}

		let braceCount = 0;
		let endIndex = -1;
		for (let i = startIndex; i < content.length; i++) {
			if (content.at(i) === "{") {
				braceCount++;
			} else if (content.at(i) === "}") {
				braceCount--;
				if (braceCount === 0) {
					endIndex = i;
					break;
				}
			}
		}

		if (endIndex === -1) {
			// JSON is still streaming — attempt repair and render a streaming-component
			// segment. Partial or invalid JSON is silently hidden; never leaked as text.
			const partialJson = content.slice(startIndex);
			const repaired = repairPartialJSON(partialJson);

			if (repaired) {
				try {
					const parsed = JSON.parse(repaired) as unknown;
					const record = parsed as Record<string, unknown>;
					if (typeof record.type === "string" && hasComponent(record.type)) {
						segments.push({
							type: "streaming-component",
							content: record as RawComponentInput,
						});
					}
				} catch {}
			}
			break;
		}

		const jsonString = content.slice(startIndex, endIndex + 1);
		try {
			const parsed = JSON.parse(jsonString) as unknown;
			if (isRawComponentInput(parsed)) {
				segments.push({ type: "component", content: parsed });
				searchIndex = endIndex + 1;
				continue;
			}
			// Valid JSON with a known component type but failed schema validation —
			// skip past it silently rather than dumping raw JSON as text.
			const record = parsed as Record<string, unknown>;
			if (typeof record.type === "string" && hasComponent(record.type)) {
				searchIndex = endIndex + 1;
				continue;
			}
		} catch {}

		searchIndex = startIndex + COMPONENT_START.length;
	}

	return { segments };
}
