/**
 * Message mapping utilities for Vercel AI SDK
 * 
 * Adapted from PostHog's AI SDK implementation:
 * https://github.com/PostHog/posthog-js/tree/main/packages/ai
 */

import type { LanguageModelPrompt } from "./guards";
import type { AIMessage, MessageContent } from "./types";
import { redactBase64DataUrl, toContentString, truncate } from "./utils";

export const mapPromptToMessages = (
	prompt: LanguageModelPrompt,
	maxSize: number
): AIMessage[] => {
	const messages: AIMessage[] = prompt.map((message) => {
		if (message.role === "system") {
			return {
				role: "system",
				content: truncate(toContentString(message.content)),
			};
		}

		if (Array.isArray(message.content)) {
			const content: MessageContent[] = message.content.map((c) => {
				if (c.type === "text") {
					return { type: "text", text: truncate(c.text) };
				}
				if (c.type === "file") {
					const data = c.data;
					const fileData =
						data instanceof URL
							? data.toString()
							: typeof data === "string"
								? redactBase64DataUrl(data)
								: "[binary file]";
					return { type: "file", file: fileData, mediaType: c.mediaType };
				}
				if ((c as { type: string }).type === "image") {
					const data = (c as { image?: unknown }).image;
					const imageData =
						data instanceof URL
							? data.toString()
							: typeof data === "string"
								? redactBase64DataUrl(data)
								: "[binary image]";
					return {
						type: "image",
						image: imageData,
						mediaType: (c as { mimeType?: string }).mimeType ?? "image/unknown",
					};
				}
				if (c.type === "tool-call") {
					const input = c.input;
					return {
						type: "tool-call",
						id: c.toolCallId,
						function: {
							name: c.toolName,
							arguments: truncate(
								typeof input === "string" ? input : JSON.stringify(input ?? {})
							),
						},
					};
				}
				if (c.type === "tool-result") {
					return {
						type: "tool-result",
						toolCallId: c.toolCallId,
						toolName: c.toolName,
						output: c.output,
						isError: false,
					};
				}
				return { type: "text", text: "" };
			});
			return { role: message.role, content };
		}

		return {
			role: message.role,
			content: truncate(toContentString(message.content)),
		};
	});

	try {
		let serialized = JSON.stringify(messages);
		let removedCount = 0;
		const initialSize = messages.length;

		for (
			let i = 0;
			i < initialSize && Buffer.byteLength(serialized, "utf8") > maxSize;
			i++
		) {
			messages.shift();
			removedCount++;
			serialized = JSON.stringify(messages);
		}

		if (removedCount > 0) {
			messages.unshift({
				role: "system",
				content: `[${removedCount} message${removedCount === 1 ? "" : "s"} removed due to size limit]`,
			});
		}
	} catch (error) {
		console.error("Error stringifying inputs", error);
		return [
			{
				role: "system",
				content: "An error occurred while processing your request. Please try again.",
			},
		];
	}

	return messages;
};

export const mapResultToMessages = (
	content: Array<{
		type: string;
		text?: string;
		toolCallId?: string;
		toolName?: string;
		input?: unknown;
		data?: unknown;
		mediaType?: string;
		sourceType?: string;
		id?: string;
		url?: string;
		title?: string;
	}>
): AIMessage[] => {
	const mappedContent: MessageContent[] = content.map((item) => {
		if (item.type === "text") {
			return { type: "text", text: truncate(item.text ?? "") };
		}
		if (item.type === "reasoning") {
			return { type: "reasoning", text: truncate(item.text ?? "") };
		}
		if (item.type === "tool-call") {
			const toolItem = item as {
				toolCallId?: string;
				toolName?: string;
				input?: unknown;
				args?: unknown;
				arguments?: unknown;
			};
			const rawArgs = toolItem.args ?? toolItem.arguments ?? toolItem.input;
			const argsValue =
				typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs ?? {});

			return {
				type: "tool-call",
				id: toolItem.toolCallId ?? "",
				function: {
					name: toolItem.toolName ?? "",
					arguments: truncate(argsValue),
				},
			};
		}
		if (item.type === "file") {
			let fileData: string;
			if (item.data instanceof URL) {
				fileData = item.data.toString();
			} else if (typeof item.data === "string") {
				fileData = redactBase64DataUrl(item.data);
				if (fileData === item.data && item.data.length > 1000) {
					fileData = `[${item.mediaType ?? "unknown"} file - ${item.data.length} bytes]`;
				}
			} else {
				fileData = "[binary file]";
			}
			return {
				type: "file",
				file: fileData,
				mediaType: (item.mediaType as string) ?? "application/octet-stream",
			};
		}
		if (item.type === "source") {
			return {
				type: "source",
				sourceType: item.sourceType ?? "unknown",
				id: item.id ?? "",
				url: item.url ?? "",
				title: item.title ?? "",
			};
		}
		return { type: "text", text: truncate(JSON.stringify(item)) };
	});

	if (mappedContent.length === 0) {
		return [];
	}

	return [
		{
			role: "assistant",
			content:
				mappedContent.length === 1 && mappedContent[0].type === "text"
					? (mappedContent[0] as { type: "text"; text: string }).text
					: mappedContent,
		},
	];
};

interface StreamSource {
	sourceType: string;
	id: string;
	url: string;
	title: string;
}

export const buildStreamOutput = (
	generatedText: string,
	reasoningText: string,
	toolCalls: Map<
		string,
		{ toolCallId: string; toolName: string; input: string }
	>,
	sources: StreamSource[] = []
): AIMessage[] => {
	const outputContent: MessageContent[] = [];
	if (reasoningText) {
		outputContent.push({ type: "reasoning", text: truncate(reasoningText) });
	}
	if (generatedText) {
		outputContent.push({ type: "text", text: truncate(generatedText) });
	}
	for (const toolCall of toolCalls.values()) {
		outputContent.push({
			type: "tool-call",
			id: toolCall.toolCallId,
			function: {
				name: toolCall.toolName,
				arguments: truncate(toolCall.input),
			},
		});
	}
	for (const source of sources) {
		outputContent.push({
			type: "source",
			sourceType: source.sourceType,
			id: source.id,
			url: source.url,
			title: source.title,
		});
	}

	if (outputContent.length === 0) {
		return [];
	}

	return [
		{
			role: "assistant",
			content:
				outputContent.length === 1 && outputContent[0].type === "text"
					? (outputContent[0] as { type: "text"; text: string }).text
					: outputContent,
		},
	];
};
