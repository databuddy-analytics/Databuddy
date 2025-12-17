"use client";

import type { UIMessage } from "ai";
import { AgentPageContent } from "./agent-page-content";

type AgentPageClientProps = {
	chatId: string;
	websiteId: string;
	initialMessages?: UIMessage[];
};

export function AgentPageClient({ chatId, websiteId }: AgentPageClientProps) {
	return (
		<div className="relative flex h-full flex-col">
			<AgentPageContent chatId={chatId} websiteId={websiteId} />
		</div>
	);
}
