import { hasComponent } from "./registry";
import type {
	ContentSegment,
	ParsedContent,
	ParsedSegments,
	RawComponentInput,
} from "./types";

const COMPONENT_START = '{"type":"';

/**
 * Type guard to validate raw component input structure
 */
function isRawComponentInput(obj: unknown): obj is RawComponentInput {
	if (typeof obj !== "object" || obj === null) {
		return false;
	}
	const record = obj as Record<string, unknown>;
	return typeof record.type === "string" && hasComponent(record.type);
}

/**
 * Parse content into ordered segments of text and components.
 * Components are rendered in the order they appear in the content.
 */
export function parseContentSegments(content: string): ParsedSegments {
	const segments: ContentSegment[] = [];
	let searchIndex = 0;

	while (searchIndex < content.length) {
		const startIndex = content.indexOf(COMPONENT_START, searchIndex);

		if (startIndex === -1) {
			// No more components, add remaining text
			const remainingText = content.substring(searchIndex).trim();
			if (remainingText) {
				segments.push({ type: "text", content: remainingText });
			}
			break;
		}

		// Add text before the component
		const textBefore = content.substring(searchIndex, startIndex).trim();
		if (textBefore) {
			segments.push({ type: "text", content: textBefore });
		}

		// Find matching closing brace
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
			// Unclosed brace, treat rest as text
			const remainingText = content.substring(searchIndex).trim();
			if (remainingText) {
				segments.push({ type: "text", content: remainingText });
			}
			break;
		}

		const jsonString = content.substring(startIndex, endIndex + 1);
		try {
			const parsed = JSON.parse(jsonString) as unknown;
			if (isRawComponentInput(parsed)) {
				segments.push({ type: "component", content: parsed });
				searchIndex = endIndex + 1;
				continue;
			}
		} catch {
			// Invalid JSON, skip
		}

		// Not a valid component, continue searching
		searchIndex = startIndex + COMPONENT_START.length;
	}

	return { segments };
}

/**
 * @deprecated Use parseContentSegments for ordered rendering
 * Parse component JSON objects from markdown content.
 * Extracts components in format: {"type":"..."}
 */
export function parseComponents(content: string): ParsedContent {
	const { segments } = parseContentSegments(content);

	const text = segments
		.filter((s): s is ContentSegment & { type: "text" } => s.type === "text")
		.map((s) => s.content)
		.join(" ");

	const components = segments
		.filter(
			(s): s is ContentSegment & { type: "component" } => s.type === "component"
		)
		.map((s) => s.content);

	return { text, components };
}
