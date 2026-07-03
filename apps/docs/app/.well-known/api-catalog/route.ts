import { createApiCatalog, linksetJsonResponse } from "@/lib/agent-discovery";

export const revalidate = 3600;

export function GET() {
	return linksetJsonResponse(createApiCatalog());
}

export function HEAD() {
	return new Response(null, {
		headers: {
			Link: '</.well-known/api-catalog>; rel="api-catalog"',
		},
	});
}
