'use client';

import type { UseChatHelpers } from '@ai-sdk/react';
import { getTextFromMessage } from '@databuddy/ai/lib/utils';
import type { ChatMessage } from '@databuddy/ai/types';
import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useRef,
	useState,
} from 'react';
import { deleteTrailingMessages } from '@/app/(main)/websites/[id]/assistant/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useChatActions } from '@ai-sdk-tools/store';

export type MessageEditorProps = {
	message: ChatMessage;
	setMode: Dispatch<SetStateAction<'view' | 'edit'>>;

};

export function MessageEditor({
	message,
	setMode,

}: MessageEditorProps) {
	const { setMessages, regenerate } = useChatActions();

	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

	const [draftContent, setDraftContent] = useState<string>(
		getTextFromMessage(message)
	);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (textareaRef.current) {
			adjustHeight();
		}
	}, []);

	const adjustHeight = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
		}
	};

	const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
		setDraftContent(event.target.value);
		adjustHeight();
	};

	return (
		<div className="flex w-full flex-col gap-2">
			<Textarea
				className="w-full resize-none overflow-hidden rounded-xl bg-transparent text-base! outline-hidden"
				onChange={handleInput}
				ref={textareaRef}
				value={draftContent}
			/>

			<div className="flex flex-row justify-end gap-2">
				<Button
					className="h-fit px-3 py-2"
					onClick={() => {
						setMode('view');
					}}
					variant="outline"
				>
					Cancel
				</Button>
				<Button
					className="h-fit px-3 py-2"
					disabled={isSubmitting}
					onClick={async () => {
						setIsSubmitting(true);

						await deleteTrailingMessages({
							id: message.id,
						});

						setMessages((messages) => {
							const index = messages.findIndex((m) => m.id === message.id);

							if (index !== -1) {
								const updatedMessage: ChatMessage = {
									...message,
									parts: [{ type: 'text', text: draftContent }],
								};

								return [...messages.slice(0, index), updatedMessage];
							}

							return messages;
						});

						setMode('view');
						regenerate();
					}}
					variant="default"
				>
					{isSubmitting ? 'Sending...' : 'Send'}
				</Button>
			</div>
		</div>
	);
}
