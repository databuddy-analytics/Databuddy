import { and, db, eq, links, isNull } from "@databuddy/db";
import { clickHouse } from "@databuddy/db";
import { createHash } from "node:crypto";
import { Elysia, t } from "elysia";

const getDailySalt = () => new Date().toISOString().split("T")[0];
const hashIP = (ip: string) =>
	createHash("sha256")
		.update(ip + getDailySalt())
		.digest("hex");

export const redirectRoute = new Elysia().get(
	"/r/:slug",
	async ({ params, request, set }) => {
		const link = await db.query.links.findFirst({
			where: and(eq(links.slug, params.slug), isNull(links.deletedAt)),
		});

		if (!link) {
			set.status = 404;
			return { success: false, error: "Link not found" };
		}

		const referer = request.headers.get("referer") || null;
		const userAgent = request.headers.get("user-agent") || null;
		const forwardedFor = request.headers.get("x-forwarded-for");
		const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
		const ipHash = hashIP(ip);

		const country = request.headers.get("cf-ipcountry") || null;
		const city = request.headers.get("cf-ipcity") || null;
		const region = request.headers.get("cf-ipregion") || null;

		try {
			await clickHouse.insert({
				table: "analytics.link_visits",
				values: [
					{
						id: crypto.randomUUID(),
						link_id: link.id,
						workspace_id: link.workspaceId,
						visited_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
						referer,
						user_agent: userAgent,
						ip_hash: ipHash,
						country,
						region,
						city,
						browser_name: null,
						device_type: null,
					},
				],
				format: "JSONEachRow",
			});
		} catch (error) {
			// Log error but don't block redirect
			console.error("Failed to track link visit:", error);
		}

		set.status = 302;
		set.headers.location = link.targetUrl;
		return;
	},
	{
		params: t.Object({
			slug: t.String(),
		}),
	}
);
