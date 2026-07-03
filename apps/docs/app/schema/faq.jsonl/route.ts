import { createFaqJsonl } from "@/lib/agent-discovery";

export const revalidate = 3600;

export function GET() {
	return new Response(createFaqJsonl(), {
		headers: {
			"Cache-Control": "public, max-age=3600, must-revalidate",
			"Content-Type": "application/ld+json-seq; charset=utf-8",
		},
	});
}
