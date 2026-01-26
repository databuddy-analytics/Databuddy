import { getWebsiteByIdV2 } from "@hooks/auth";
import { getApiKeyFromHeader, hasKeyScope } from "@lib/api-key";
import { insertCustomEvents } from "@lib/event-service";
import { captureError } from "@lib/tracing";
import { Elysia } from "elysia";
import { z } from "zod";

const trackEventSchema = z.union([
	z.object({
		name: z.string().min(1).max(256),
		namespace: z.string().max(64).optional(),
		timestamp: z.union([z.number(), z.string(), z.date()]).optional(),
		properties: z.record(z.string(), z.unknown()).optional(),
		anonymousId: z.string().max(256).optional(),
		sessionId: z.string().max(256).optional(),
		websiteId: z.uuid().optional(),
		source: z.string().max(64).optional(),
	}),
	z.array(
		z.object({
			name: z.string().min(1).max(256),
			namespace: z.string().max(64).optional(),
			timestamp: z.union([z.number(), z.string(), z.date()]).optional(),
			properties: z.record(z.string(), z.unknown()).optional(),
			anonymousId: z.string().max(256).optional(),
			sessionId: z.string().max(256).optional(),
			websiteId: z.uuid().optional(),
			source: z.string().max(64).optional(),
		})
	),
]);

type AuthResult =
	| { success: true; ownerId: string; websiteId?: string }
	| {
			success: false;
			error: { status: string; message: string };
			status: number;
	  };

function json(data: unknown, status: number): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function parseTimestamp(
	value: number | string | Date | undefined,
	fallback: number
): number {
	if (value === undefined) {
		return fallback;
	}
	if (typeof value === "number") {
		return value;
	}
	if (value instanceof Date) {
		return value.getTime();
	}
	return new Date(value).getTime();
}

async function resolveAuth(
	headers: Headers,
	websiteIdParam?: string
): Promise<AuthResult> {
	const apiKey = await getApiKeyFromHeader(headers);

	if (apiKey) {
		if (!hasKeyScope(apiKey, "track:events")) {
			return {
				success: false,
				error: {
					status: "error",
					message: "API key missing track:events scope",
				},
				status: 403,
			};
		}

		const ownerId = apiKey.organizationId ?? apiKey.userId;
		if (!ownerId) {
			return {
				success: false,
				error: { status: "error", message: "API key missing owner" },
				status: 400,
			};
		}

		return { success: true, ownerId };
	}

	if (!websiteIdParam) {
		return {
			success: false,
			error: { status: "error", message: "API key or website_id required" },
			status: 401,
		};
	}

	const website = await getWebsiteByIdV2(websiteIdParam);
	if (!website) {
		return {
			success: false,
			error: { status: "error", message: "Website not found" },
			status: 404,
		};
	}

	if (!website.organizationId) {
		return {
			success: false,
			error: { status: "error", message: "Website missing organization" },
			status: 400,
		};
	}

	return {
		success: true,
		ownerId: website.organizationId,
		websiteId: websiteIdParam,
	};
}

export const trackRoute = new Elysia().post(
	"/track",
	async ({ body, query, request }) => {
		const typedBody = body as unknown;
		const typedQuery = query as Record<string, string>;

		try {
			const parseResult = trackEventSchema.safeParse(typedBody);
			if (!parseResult.success) {
				return json(
					{
						status: "error",
						message: "Invalid request body",
						issues: parseResult.error.issues,
					},
					400
				);
			}

			const events = Array.isArray(parseResult.data)
				? parseResult.data
				: [parseResult.data];
			const websiteIdParam = typedQuery.website_id || events[0]?.websiteId;

			const auth = await resolveAuth(request.headers, websiteIdParam);
			if (!auth.success) {
				return json(auth.error, auth.status);
			}

			const now = Date.now();
			const spans = events.map((event) => ({
				owner_id: auth.ownerId,
				website_id: event.websiteId ?? auth.websiteId,
				timestamp: parseTimestamp(event.timestamp, now),
				event_name: event.name,
				namespace: event.namespace,
				properties: event.properties,
				anonymous_id: event.anonymousId,
				session_id: event.sessionId,
				source: event.source,
			}));

			await insertCustomEvents(spans);

			return json(
				{ status: "success", type: "custom_event", count: spans.length },
				200
			);
		} catch (error) {
			captureError(error, { message: "Error processing track events" });
			return json({ status: "error", message: "Internal server error" }, 500);
		}
	}
);
