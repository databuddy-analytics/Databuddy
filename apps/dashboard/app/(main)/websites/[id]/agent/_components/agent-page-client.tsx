"use client";

import { AgentPageContent } from "./agent-page-content";

type AgentPageClientProps = {
	chatId: string;
	websiteId: string;
};

export function AgentPageClient({ chatId, websiteId }: AgentPageClientProps) {
	return (
		<div className="relative flex h-full flex-col">
			<AgentPageContent chatId={chatId} websiteId={websiteId} />
		</div>
	);
}
