"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useGlobalAgent } from "@/components/agent/global-agent-provider";
import { AgentGatePlaceholder, useAgentGate } from "./agent-gate";

export function GlobalAgentRedirect() {
	const router = useRouter();
	const { chatId } = useGlobalAgent();
	const gate = useAgentGate();
	const ready = gate.status === "ready";

	useEffect(() => {
		if (ready && chatId) {
			router.replace(`/agent/${chatId}`);
		}
	}, [ready, chatId, router]);

	return <AgentGatePlaceholder status={ready ? "loading" : gate.status} />;
}
