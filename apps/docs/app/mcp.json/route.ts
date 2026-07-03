import { agentJsonResponse, createMcpManifest } from "@/lib/agent-discovery";

export const revalidate = 3600;

export function GET() {
	return agentJsonResponse(createMcpManifest());
}
