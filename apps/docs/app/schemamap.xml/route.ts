import { createSchemaMapXml } from "@/lib/agent-discovery";

export const revalidate = 3600;

export function GET() {
	return new Response(createSchemaMapXml(), {
		headers: {
			"Cache-Control": "public, max-age=3600, must-revalidate",
			"Content-Type": "application/xml; charset=utf-8",
		},
	});
}
