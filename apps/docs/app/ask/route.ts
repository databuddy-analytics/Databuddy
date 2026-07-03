import {
	createNlwebAnswer,
	createNlwebSseBody,
	parseNlwebAskBody,
} from "@/lib/agent-discovery";

export const revalidate = 0;

async function readBody(request: Request) {
	try {
		return parseNlwebAskBody(await request.json());
	} catch {
		return { query: "", streaming: false };
	}
}

function sseResponse(payload: unknown) {
	return new Response(createNlwebSseBody(payload), {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "text/event-stream; charset=utf-8",
		},
	});
}

export async function POST(request: Request) {
	const { query, streaming } = await readBody(request);
	const payload = createNlwebAnswer(query);
	return streaming
		? sseResponse(payload)
		: Response.json(payload, {
				headers: {
					"Cache-Control": "public, max-age=300, must-revalidate",
				},
			});
}
