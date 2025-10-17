import type { ChatMessage } from '@databuddy/ai/types';

import type { Vote } from '@databuddy/db';
import {
	ArrowClockwiseIcon,
	CheckIcon,
	CopyIcon,
	PencilIcon,
	ThumbsDownIcon,
	ThumbsUpIcon,
} from '@phosphor-icons/react';
import equal from 'fast-deep-equal';
import { memo, useState } from 'react';
import { toast } from 'sonner';
import { useCopyToClipboard } from 'usehooks-ts';
import { Action, Actions } from '@/components/ai-elements/actions';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useChatActions, useChatMessages, useChatStatus } from '@ai-sdk-tools/store';
import { deleteTrailingMessages } from '@/app/(main)/websites/[id]/assistant/actions';

export function PureMessageActions({
	chatId,
	message,
	vote,
	isLoading,
	mode,
	setMode,
}: {
	chatId: string;
	message: ChatMessage;
	vote: Vote | undefined;
	isLoading: boolean;
	mode: 'view' | 'edit';
	setMode?: (mode: 'view' | 'edit') => void;
}) {
	const [_, copyToClipboard] = useCopyToClipboard();
	const [copied, setCopied] = useState(false);
	const [_optimisticVote, setOptimisticVote] = useState<boolean | null>(null);
	const utils = trpc.useUtils();
	const { regenerate } = useChatActions();
	const messages = useChatMessages();

	const voteMutation = trpc.assistant.voteMessage.useMutation({
		// Optimistic update: update votes cache immediately to avoid flicker
		onMutate: async ({ chatId: mutateChatId, messageId, type }) => {
			// cancel any outgoing refetches
			await utils.assistant.getVotes
				.cancel({ chatId: mutateChatId } as any)
				.catch(() => {
					/* ignore */
				});

			// Snapshot previous votes
			const previousVotes = utils.assistant.getVotes.getData({
				chatId: mutateChatId,
			});

			// Optimistically update cache
			utils.assistant.getVotes.setData({ chatId: mutateChatId }, (old: any) => {
				if (!old) {
					return old;
				}
				const exists = old.find((v: any) => v.messageId === messageId);
				if (exists) {
					return old.map((v: any) =>
						v.messageId === messageId ? { ...v, isUpvoted: type === 'up' } : v
					);
				}
				// if no existing vote, append
				return [
					...old,
					{ chatId: mutateChatId, messageId, isUpvoted: type === 'up' },
				];
			});

			return { previousVotes, chatId: mutateChatId };
		},
		onError: (_err, _vars, context) => {
			setOptimisticVote(null);
			if (context?.previousVotes && context.chatId) {
				utils.assistant.getVotes.setData(
					{ chatId: context.chatId },
					context.previousVotes
				);
			}
		},
		onSuccess: (_data, vars) => {
			// Confirm optimistic change with server result by re-applying the same change
			setOptimisticVote(null);
			utils.assistant.getVotes.setData({ chatId: vars.chatId }, (old: any) => {
				if (!old) {
					return old;
				}
				return old.map((v: any) =>
					v.messageId === vars.messageId
						? { ...v, isUpvoted: vars.type === 'up' }
						: v
				);
			});
		},
	});

	if (isLoading) {
		return null;
	}

	const textFromParts = message.parts
		?.filter((part) => part.type === 'text')
		.map((part) => part.text)
		.join('\n')
		.trim();

	const handleCopy = async () => {
		if (!textFromParts) {
			toast.error("There's no text to copy!");
			return;
		}

		await copyToClipboard(textFromParts);
		setCopied(true);
		toast.success('Copied to clipboard!');
		setTimeout(() => setCopied(false), 2000);
	};

	const handleRegenerate = async () => {
		const index = messages.findIndex((m) => m.id === message.id);
		
		if (index === -1) {
			return;
		}

		const prevMessage = messages[index - 1];
		await deleteTrailingMessages({
			id: prevMessage.id,
		});
		await regenerate({ messageId: prevMessage.id });
	};

	// User messages get edit (on hover) and copy actions
	if (message.role === 'user') {
		return (
			<Actions className="-mr-0.5 justify-end">
				<div
					className={cn(
						'gap-1 opacity-100 transition-opacity group-hover:opacity-100 md:opacity-0',
						{
							'md:opacity-100': mode === 'edit',
						}
					)}
				>
					{setMode && (
						<Action onClick={() => setMode('edit')} tooltip="Edit">
							<PencilIcon size={16} />
						</Action>
					)}
					<Action onClick={handleCopy} tooltip="Copy">
						<span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
						<CopyIcon
							className={`size-4 transition-all duration-300 ${copied ? 'scale-0' : 'scale-100'}`}
						/>
						<CheckIcon
							className={`absolute inset-0 m-auto size-4 transition-all duration-300 ${copied ? 'scale-100' : 'scale-0'}`}
						/>
					</Action>
				</div>
			</Actions>
		);
	}

	return (
		<Actions className="-ml-0.5">
			<Action onClick={handleCopy} tooltip="Copy">
				<span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
				<CopyIcon
					className={`size-4 transition-all duration-300 ${copied ? 'scale-0' : 'scale-100'}`}
				/>
				<CheckIcon
					className={`absolute inset-0 m-auto size-4 transition-all duration-300 ${copied ? 'scale-100' : 'scale-0'}`}
				/>
			</Action>

			<Action onClick={handleRegenerate} tooltip="Regenerate">
				<ArrowClockwiseIcon size={16} />
			</Action>
			
			<Action
				disabled={vote?.isUpvoted || voteMutation.isPending}
				onClick={() => {
					toast.promise(
						voteMutation.mutateAsync({
							chatId,
							messageId: message.id,
							type: 'up',
						}),
						{
							loading: 'Upvoting Response...',
							success: 'Upvoted Response!',
							error: 'Failed to upvote response.',
						}
					);
				}}
				tooltip="Upvote Response"
			>
				<ThumbsUpIcon size={16} />
			</Action>

			<Action
				disabled={(vote && !vote.isUpvoted) || voteMutation.isPending}
				onClick={() => {
					toast.promise(
						voteMutation.mutateAsync({
							chatId,
							messageId: message.id,
							type: 'down',
						}),
						{
							loading: 'Downvoting Response...',
							success: 'Downvoted Response!',
							error: 'Failed to downvote response.',
						}
					);
				}}
				tooltip="Downvote Response"
			>
				<ThumbsDownIcon size={16} />
			</Action>
		</Actions>
	);
}

export const MessageActions = memo(
	PureMessageActions,
	(prevProps, nextProps) => {
		if (!equal(prevProps.vote, nextProps.vote)) {
			return false;
		}
		if (prevProps.isLoading !== nextProps.isLoading) {
			return false;
		}

		return true;
	}
);
