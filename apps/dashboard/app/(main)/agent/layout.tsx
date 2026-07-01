import type { ReactNode } from "react";
import { GlobalAgentProvider } from "@/components/agent/global-agent-provider";

export default function AgentLayout({ children }: { children: ReactNode }) {
	return <GlobalAgentProvider>{children}</GlobalAgentProvider>;
}
