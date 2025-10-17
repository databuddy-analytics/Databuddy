'use client';

import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage } from '@databuddy/ai/types';
import { ChartBarIcon, HashIcon, TrendUpIcon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { memo } from 'react';
import {
	type SuggestedAction,
	Suggestion,
} from '@/components/ai-elements/suggestion';
import { useChatActions } from '@ai-sdk-tools/store';

interface SuggestedActionsProps {
	chatId: string;
	websiteId: string;
}

function PureSuggestedActions({
	chatId,
	websiteId,
}: SuggestedActionsProps) {
	const { sendMessage } = useChatActions();
	const suggestedActions: SuggestedAction[] = [
		{
			text: 'Show me page views over the last 7 days',
			icon: TrendUpIcon,
			type: 'chart',
		},
		{ text: 'How many visitors yesterday?', icon: HashIcon, type: 'metric' },
		{
			text: 'Top traffic sources breakdown',
			icon: ChartBarIcon,
			type: 'chart',
		},
		{ text: "What's my bounce rate?", icon: HashIcon, type: 'metric' },
	];

	return (
		<div className="grid w-full gap-2 sm:grid-cols-2">
			{suggestedActions.map((suggestedAction, index) => (
				<motion.div
					animate={{ opacity: 1, y: 0 }}
					className={index > 1 ? 'hidden sm:block' : 'block'}
					exit={{ opacity: 0, y: 20 }}
					initial={{ opacity: 0, y: 20 }}
					key={suggestedAction.text}
					transition={{ delay: 0.05 * index }}
				>
					<Suggestion
						className="h-auto w-full whitespace-normal p-3 text-left"
						onClick={(suggestion: SuggestedAction) => {
							window.history.replaceState(
								{},
								'',
								`/websites/${websiteId}/assistant/${chatId}`
							);
							sendMessage({
								role: 'user',
								parts: [{ type: 'text', text: suggestion.text }],
							});
						}}
						suggestion={suggestedAction}
					>
						<suggestedAction.icon className="mr-3 h-4 w-4 flex-shrink-0 text-primary/70" />
						<div className="flex-1">
							<div className="font-medium">{suggestedAction.text}</div>
							<div className="text-muted-foreground text-xs capitalize">
								{suggestedAction.type} response
							</div>
						</div>
					</Suggestion>
				</motion.div>
			))}
		</div>
	);
}

export const SuggestedActions = memo(
	PureSuggestedActions,
	(prevProps, nextProps) => {
		if (prevProps.chatId !== nextProps.chatId) {
			return false;
		}

		return true;
	}
);
