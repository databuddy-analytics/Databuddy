'use client';

import { useEffect, useState } from 'react';
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from '@/components/ai-elements/reasoning';

interface MessageReasoningProps {
	isLoading: boolean;
	reasoning: string;
}

export function MessageReasoning({
	isLoading,
	reasoning,
}: MessageReasoningProps) {
	const [hasBeenStreaming, setHasBeenStreaming] = useState(isLoading);

	useEffect(() => {
		if (isLoading) {
			setHasBeenStreaming(true);
		}
	}, [isLoading]);

	return (
		<Reasoning defaultOpen={hasBeenStreaming} isStreaming={isLoading}>
			<ReasoningTrigger />
			<ReasoningContent>{reasoning}</ReasoningContent>
		</Reasoning>
	);
}
