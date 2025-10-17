import type { UIMessage } from 'ai';
import { z } from 'zod';
import type { UITools } from './tool-types';

export type DataPart = { type: 'append-message'; message: string };

export const messageMetadataSchema = z.object({
	toolCall: z.object({
		toolName: z.string(),
		toolParameters: z.record(z.string(), z.any()),
	}),
	createdAt: z.string(),
});


export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export type ChatMessage = UIMessage<MessageMetadata, UITools>;

export interface Attachment {
	name: string;
	url: string;
	contentType: string;
}
