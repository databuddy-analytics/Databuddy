"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useGlobalAgent } from "@/components/agent/global-agent-provider";
import { Skeleton } from "@databuddy/ui";
import { AgentNoWebsites } from "./agent-no-websites";

export function GlobalAgentRedirect() {
	const router = useRouter();
	const { chatId, organizationId, hasWebsites, isLoading } = useGlobalAgent();

	useEffect(() => {
		if (chatId) {
			router.replace(`/agent/${chatId}`);
		}
	}, [chatId, router]);

	if (organizationId && !(isLoading || hasWebsites)) {
		return <AgentNoWebsites />;
	}

	return (
		<div className="flex h-full flex-col gap-3 p-4">
			<Skeleton className="h-8 w-48 rounded" />
			<Skeleton className="h-full w-full rounded" />
		</div>
	);
}
