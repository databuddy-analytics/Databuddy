"use client";

import { useGlobalAgent } from "@/components/agent/global-agent-provider";
import { Skeleton } from "@databuddy/ui";
import { AgentNoWebsites } from "./agent-no-websites";

type AgentGate =
	| { status: "loading" | "no-websites" }
	| { status: "ready"; organizationId: string };

export function useAgentGate(): AgentGate {
	const { organizationId, hasWebsites, isLoading } = useGlobalAgent();
	if (isLoading || !organizationId) {
		return { status: "loading" };
	}
	if (!hasWebsites) {
		return { status: "no-websites" };
	}
	return { status: "ready", organizationId };
}

export function AgentGatePlaceholder({
	status,
}: {
	status: "loading" | "no-websites";
}) {
	if (status === "no-websites") {
		return <AgentNoWebsites />;
	}
	return (
		<div className="flex h-full flex-col gap-3 p-4">
			<Skeleton className="h-8 w-48 rounded" />
			<Skeleton className="h-full w-full rounded" />
		</div>
	);
}
