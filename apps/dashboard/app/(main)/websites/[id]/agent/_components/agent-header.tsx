"use client";

import { AgentNavigation } from "./agent-navigation";
import { AgentTitle } from "./agent-title";
import { NewChatButton } from "./new-chat-button";

type AgentHeaderProps = {
	showBackButton?: boolean;
};

export function AgentHeader({ showBackButton = false }: AgentHeaderProps) {
	return (
		<div className="relative flex h-10 items-center justify-center">
			{showBackButton && <AgentNavigation />}
			<AgentTitle />
			<div className="absolute right-0 flex items-center gap-2">
				<NewChatButton />
			</div>
		</div>
	);
}
