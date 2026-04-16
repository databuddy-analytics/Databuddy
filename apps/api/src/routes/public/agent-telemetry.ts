import { db, eq } from "@databuddy/db";
import { agentInstallTelemetry, websites } from "@databuddy/db/schema";
import { cacheable } from "@databuddy/redis";
import { getRateLimitHeaders, rateLimit } from "@databuddy/redis/rate-limit";
import { randomUUIDv7 } from "bun";
import { Elysia, t } from "elysia";
import { captureError, mergeWideEvent } from "@/lib/tracing";

// Cache website existence checks — returns true/false, caches both (negative cache).
// 5 min TTL, stale-while-revalidate after 2 min.
const checkWebsiteExists = cacheable(
	async function checkWebsiteExists(websiteId: string): Promise<boolean> {
		const row = await db.query.websites.findFirst({
			where: eq(websites.id, websiteId),
			columns: { id: true },
		});
		return !!row;
	},
	{
		expireInSec: 300,
		prefix: "agent-telemetry:website-exists",
		staleWhileRevalidate: true,
		staleTime: 120,
	}
);

export const agentTelemetryRoute = new Elysia({
	prefix: "/v1/agent-telemetry",
}).post(
	"/",
	async function reportAgentInstall({ body, set }) {
		mergeWideEvent({
			agent_telemetry: true,
			agent_telemetry_website_id: body.websiteId,
			agent_telemetry_agent: body.agent,
			agent_telemetry_status: body.status,
		});

		if (body.framework) {
			mergeWideEvent({ agent_telemetry_framework: body.framework });
		}
		if (body.installMethod) {
			mergeWideEvent({ agent_telemetry_install_method: body.installMethod });
		}
		if (body.issues && body.issues.length > 0) {
			mergeWideEvent({
				agent_telemetry_issue_count: body.issues.length,
				agent_telemetry_issue_types: body.issues.map((i) => i.type).join(","),
			});
		}
		if (body.durationMs != null) {
			mergeWideEvent({ agent_telemetry_duration_ms: body.durationMs });
		}

		// Rate limit: 10 requests per hour per websiteId
		const rl = await rateLimit(`agent-telemetry:${body.websiteId}`, 10, 3600);
		const rlHeaders = getRateLimitHeaders(rl);
		for (const [key, value] of Object.entries(rlHeaders)) {
			set.headers[key] = value;
		}
		if (!rl.success) {
			mergeWideEvent({ agent_telemetry_rejected: "rate_limit" });
			set.status = 429;
			return {
				success: false,
				error: "Rate limit exceeded. Try again later.",
			};
		}

		// Verify websiteId exists (cached, including negative results)
		const exists = await checkWebsiteExists(body.websiteId);
		if (!exists) {
			mergeWideEvent({ agent_telemetry_rejected: "invalid_website" });
			set.status = 401;
			return {
				success: false,
				error: "Invalid websiteId.",
			};
		}

		try {
			const [row] = await db
				.insert(agentInstallTelemetry)
				.values({
					id: randomUUIDv7(),
					websiteId: body.websiteId,
					agent: body.agent,
					status: body.status,
					framework: body.framework ?? null,
					installMethod: body.installMethod ?? null,
					durationMs: body.durationMs ?? null,
					stepsCompleted: body.stepsCompleted ?? null,
					issues: body.issues ?? null,
					errorMessage: body.errorMessage ?? null,
					metadata: body.metadata ?? null,
				})
				.returning({ id: agentInstallTelemetry.id });

			if (!row) {
				throw new Error("Insert returned no rows");
			}

			mergeWideEvent({
				agent_telemetry_recorded: true,
				agent_telemetry_id: row.id,
			});

			return { success: true, id: row.id };
		} catch (error) {
			mergeWideEvent({ agent_telemetry_error: true });
			captureError(error, { agent_telemetry: true });
			set.status = 500;
			return {
				success: false,
				error:
					process.env.NODE_ENV === "development"
						? String(error)
						: "Failed to record telemetry",
			};
		}
	},
	{
		body: t.Object({
			websiteId: t.String({ minLength: 1 }),
			agent: t.String({
				minLength: 1,
				description: "e.g. claude, cursor, copilot, windsurf",
			}),
			status: t.Union([
				t.Literal("success"),
				t.Literal("partial"),
				t.Literal("failed"),
			]),
			framework: t.Optional(
				t.String({ description: "e.g. nextjs, react, vue, vanilla" })
			),
			installMethod: t.Optional(
				t.String({ description: "e.g. sdk, script-tag" })
			),
			durationMs: t.Optional(
				t.Number({ description: "How long the install took in ms" })
			),
			stepsCompleted: t.Optional(
				t.Array(t.String(), {
					description: "Which steps succeeded: install, mount, env-var, verify",
				})
			),
			issues: t.Optional(
				t.Array(
					t.Object({
						type: t.String({
							description:
								"e.g. csp, adblocker, domain-mismatch, script-blocked",
						}),
						detail: t.Optional(t.String()),
						resolved: t.Optional(t.Boolean()),
					}),
					{
						description: "Problems encountered and whether they were resolved",
					}
				)
			),
			errorMessage: t.Optional(
				t.String({ description: "Final error if status is failed" })
			),
			metadata: t.Optional(
				t.Record(t.String(), t.Unknown(), {
					description: "Any extra context",
				})
			),
		}),
	}
);
