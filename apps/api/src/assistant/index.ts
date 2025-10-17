import { setContext } from '@databuddy/ai/context';
import {
	getChatById,
	getMessagesByChatId,
	saveChat,
	saveMessages,
} from '@databuddy/ai/lib/queries';
import { convertToUIMessages, generateUUID } from '@databuddy/ai/lib/utils';
import { systemPrompt } from '@databuddy/ai/prompts';
import { config, provider } from '@databuddy/ai/providers';
import { createToolRegistry } from '@databuddy/ai/tool-types';
import type { ChatMessage } from '@databuddy/ai/types';
import type { User } from '@databuddy/auth';
import type { StreamingUpdate } from '@databuddy/shared';
import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	smoothStream,
	stepCountIs,
	streamText,
	validateUIMessages,
} from 'ai';
import { shouldForceStop } from '@/lib/streaming-utils';
import type { AssistantRequestType } from '../schemas/assistant-schemas';
import type { RequestHints } from '../types/agent';
import { generateTitleFromUserMessage } from './utils';

interface HandleMessageProps {
	id: string;
	message: ChatMessage;
	selectedChatModel: AssistantRequestType['selectedChatModel'];
	requestHints: RequestHints;
	user: User;
}

function createErrorResponse(message: string): StreamingUpdate[] {
	return [{ type: 'error', content: message }];
}

export async function handleMessage({
	id,
	message,
	selectedChatModel,
	requestHints,
	user,
}: HandleMessageProps) {
	const chat = await getChatById({ id });

	if (chat) {
		if (chat.userId !== user.id) {
			return createErrorResponse('forbidden:chat');
		}
	} else {
		const title = await generateTitleFromUserMessage({
			message,
		});

		await saveChat({
			id,
			userId: user.id,
			websiteId: requestHints.websiteId,
			title,
		});
	}

	const messagesFromDb = await getMessagesByChatId({ id });
	const uiMessages = await validateUIMessages({
		messages: [...convertToUIMessages(messagesFromDb), message],
	});

	await saveMessages({
		messages: [
			{
				chatId: id,
				id: message.id,
				role: 'user',
				parts: message.parts,
				attachments: [],
				createdAt: new Date(),
			},
		],
	});

	const system = systemPrompt({
		selectedChatModel,
		requestHints,
	});

	const modeConfig = config[selectedChatModel];

	const stream = createUIMessageStream({
		execute: ({ writer }) => {
			setContext({
				writer,
				user,
				websiteId: requestHints.websiteId,
				websiteHostname: requestHints.websiteHostname,
			});

			const result = streamText({
				model: provider.languageModel(selectedChatModel),
				system,
				messages: convertToModelMessages(uiMessages),
				temperature: modeConfig.temperature,
				stopWhen: (step) => {
					if (stepCountIs(modeConfig.stepCount)(step)) {
						return true;
					}

					return shouldForceStop(step);
				},
				experimental_transform: smoothStream({ chunking: 'word' }),
				tools: createToolRegistry(),
			});

			result.consumeStream();
			writer.merge(
				result.toUIMessageStream({
					sendStart: false,
				})
			);
		},
		onFinish: async ({ messages }) => {
			await saveMessages({
				messages: messages.map((message) => ({
					id: message.id,
					role: message.role,
					parts: message.parts,
					createdAt: new Date(),
					attachments: [],
					chatId: id,
				})),
			});
		},
		onError: () => {
			return 'Oops, an error occurred!';
		},
		generateId: generateUUID,
	});

	return createUIMessageStreamResponse({ stream });
}
