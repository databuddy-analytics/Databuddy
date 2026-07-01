"use client";

import { AgentLoadingSkeleton } from "@/components/agent/agent-loading-skeleton";
import { useGlobalAgent } from "@/components/agent/global-agent-provider";
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
	return <AgentLoadingSkeleton />;
}
