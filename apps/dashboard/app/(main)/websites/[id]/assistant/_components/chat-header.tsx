'use client';

import { PlusIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChatHistory } from './history';

export function ChatHeader({
	websiteId,
	chatId,
}: {
	websiteId: string;
	chatId: string;
}) {
	const router = useRouter();

	const handleNewChat = () => {
		router.push(`/websites/${websiteId}/assistant`);
	};

	return (
		<div className="relative z-10 flex h-22 w-full justify-between rounded-t-2xl border-border border-b bg-background p-6">
			<div className="flex items-center">
				<Button onClick={handleNewChat} size="icon" variant="outline">
					<PlusIcon size={16} />
				</Button>
			</div>

			<div
				className={cn(
					'flex items-center justify-center transition-all duration-300 ease-in-out'
				)}
			>
				{/* {data && (
					<TextEffect
						per="char"
						preset="fade"
						speedReveal={3}
						speedSegment={2}
						className="text-sm font-regular truncate"
					>
						{data.title}
					</TextEffect>
				)} */}
			</div>

			<div className="flex items-center space-x-4 transition-all duration-300 ease-in-out">
				<ChatHistory websiteId={websiteId} />
			</div>
		</div>
	);
}
