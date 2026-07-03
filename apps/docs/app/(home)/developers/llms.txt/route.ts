import { createScopedLlmsText, markdownResponse } from "@/lib/agent-discovery";

export const revalidate = 3600;

export function GET() {
	return markdownResponse(createScopedLlmsText("developers"));
}
