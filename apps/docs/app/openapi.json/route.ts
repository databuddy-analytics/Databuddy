import { API_URL } from "@/app/util/constants";

export const revalidate = 3600;

export async function GET() {
	const response = await fetch(`${API_URL}/spec.json`, {
		next: { revalidate: 3600 },
		headers: {
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		return Response.json(
			{
				error: "Databuddy OpenAPI specification is temporarily unavailable.",
			},
			{
				status: 502,
				headers: {
					"Cache-Control": "no-store",
				},
			}
		);
	}

	return new Response(await response.text(), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "public, max-age=3600, must-revalidate",
		},
	});
}
