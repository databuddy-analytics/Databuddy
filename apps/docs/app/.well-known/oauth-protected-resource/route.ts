import {
	agentJsonResponse,
	createProtectedResourceMetadata,
} from "@/lib/agent-discovery";
import { SITE_URL } from "@/app/util/constants";

export const revalidate = 3600;

export function GET() {
	return agentJsonResponse(createProtectedResourceMetadata(SITE_URL));
}
