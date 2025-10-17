'use client';
import type { ChatMessage } from '@databuddy/ai/types';
import type { Vote } from '@databuddy/db';
// import { PreviewAttachment } from './preview-attachment';
import equal from 'fast-deep-equal';
import { memo, useState } from 'react';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { cn, sanitizeText } from '@/lib/utils';
import { MessageActions } from './message-actions';
import { MessageEditor } from './message-editor';
import { MessageReasoning } from './message-reasoning';
import { useChatStatus } from '@ai-sdk-tools/store';
import { ToolCallIndicator } from './tool-call-message';

const PurePreviewMessage = ({
	chatId,
	message,

	vote,
	isLoading,
	isReadonly,
}: {
	chatId: string;
	message: ChatMessage;
	vote: Vote | undefined;
	isLoading: boolean;
	isReadonly: boolean;
}) => {
	const [mode, setMode] = useState<'view' | 'edit'>('view');
	// const attachmentsFromMessage = message.parts.filter(
	//     (part) => part.type === 'file',
	// );
	const status = useChatStatus();
	return (
		<Message from={message.role} key={message.id}>
			<div
				className={cn('flex flex-col', {
					'gap-2 md:gap-4': message.parts?.some(
						(p) => p.type === 'text' && p.text?.trim()
					),
					'w-full':
						(message.role === 'assistant' &&
							message.parts?.some(
								(p) => p.type === 'text' && p.text?.trim()
							)) ||
						mode === 'edit',
					'max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]':
						message.role === 'user' && mode !== 'edit',
				})}
			>
				{/* {attachmentsFromMessage.length > 0 && (
                        <div
                            data-testid={`message-attachments`}
                            className="flex flex-row justify-end gap-2"
                        >
                            {attachmentsFromMessage.map((attachment) => (
                                <PreviewAttachment
                                    key={attachment.url}
                                    attachment={{
                                        name: attachment.filename ?? 'file',
                                        contentType: attachment.mediaType,
                                        url: attachment.url,
                                    }}
                                />
                            ))}
                        </div>
                    )} */}

				{message.parts?.map((part, index: number) => {
					const { type } = part;
					const key = `message-${message.id}-part-${index}`;

					if (type === 'reasoning' && part.text?.trim().length > 0) {
						return (
							<MessageReasoning
								isLoading={isLoading}
								key={key}
								reasoning={part.text}
							/>
						);
					}

					if (type.startsWith('tool-')) {
						const { state } = part;
						const toolName = type.replace('tool-', '');

						return (
							<MessageContent key={key} variant={'flat'}>
								{state !== 'output-available' && (
									<ToolCallIndicator toolName={toolName} />
								)}
								<Response>{(part as any)?.output?.text}</Response>
							</MessageContent>
						);
					}

					if (type === 'text') {
						if (mode === 'view') {
							return (
								<MessageContent key={key} variant={'flat'}>
									<Response>{sanitizeText(part.text)}</Response>
								</MessageContent>
							);
						}

						if (mode === 'edit') {
							return (
								<div
									className="flex w-full flex-row items-start gap-3"
									key={key}
								>
									<div className="size-8" />
									<div className="min-w-0 flex-1">
										<MessageEditor
											key={message.id}
											message={message}
											setMode={setMode}
										/>
									</div>
								</div>
							);
						}
					}

					return null;
				})}

				{!isReadonly && status !== 'streaming' && (
					<MessageActions
						chatId={chatId}
						isLoading={isLoading}
						key={`action-${message.id}`}
						message={message}
						mode={mode}
						setMode={setMode}
						vote={vote}
					/>
				)}
			</div>
		</Message>
	);
};

export const PreviewMessage = memo(
	PurePreviewMessage,
	(prevProps, nextProps) => {
		if (prevProps.isLoading !== nextProps.isLoading) {
			return false;
		}
		if (prevProps.message.id !== nextProps.message.id) {
			return false;
		}
		if (!equal(prevProps.message.parts, nextProps.message.parts)) {
			return false;
		}
		if (!equal(prevProps.vote, nextProps.vote)) {
			return false;
		}

		return false;
	}
);
