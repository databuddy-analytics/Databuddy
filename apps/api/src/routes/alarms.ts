import { auth } from "@databuddy/auth";
import {
	alarmDestinations,
	alarms,
	and,
	db,
	eq,
	member,
} from "@databuddy/db";
import {
	sendDiscordWebhook,
	sendSlackWebhook,
	sendTelegramMessage,
	sendTeamsWebhook,
	sendWebhook,
	sendGoogleChatWebhook,
} from "@databuddy/notifications";
import { generateId } from "ai";
import { Elysia, t } from "elysia";
import { useLogger } from "evlog/elysia";
import { captureError } from "@/lib/tracing";

const AlarmDestinationSchema = t.Object({
	type: t.Union([
		t.Literal("slack"),
		t.Literal("discord"),
		t.Literal("email"),
		t.Literal("webhook"),
		t.Literal("teams"),
		t.Literal("telegram"),
		t.Literal("google_chat"),
	]),
	identifier: t.String({ minLength: 1 }),
	config: t.Optional(t.Record(t.String(), t.Unknown())),
});

const CreateAlarmBody = t.Object({
	name: t.String({ minLength: 1, maxLength: 255 }),
	description: t.Optional(t.String({ maxLength: 1000 })),
	websiteId: t.Optional(t.String()),
	triggerType: t.String({ minLength: 1 }),
	triggerConditions: t.Optional(t.Record(t.String(), t.Unknown())),
	destinations: t.Optional(t.Array(AlarmDestinationSchema)),
});

const UpdateAlarmBody = t.Object({
	name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
	description: t.Optional(t.String({ maxLength: 1000 })),
	enabled: t.Optional(t.Boolean()),
	triggerType: t.Optional(t.String({ minLength: 1 })),
	triggerConditions: t.Optional(t.Record(t.String(), t.Unknown())),
	destinations: t.Optional(t.Array(AlarmDestinationSchema)),
});

async function getActiveOrganizationId(userId: string): Promise<string | null> {
	const membership = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(eq(member.userId, userId))
		.limit(1);
	return membership[0]?.organizationId ?? null;
}

async function sendTestNotification(
	destination: { type: string; identifier: string; config?: Record<string, unknown> },
	alarmName: string
): Promise<void> {
	const payload = {
		title: `🔔 Test notification: ${alarmName}`,
		message: `This is a test notification from Databuddy for alarm "${alarmName}".`,
		timestamp: new Date().toISOString(),
	};

	switch (destination.type) {
		case "slack":
			await sendSlackWebhook(destination.identifier, payload);
			break;
		case "discord":
			await sendDiscordWebhook(destination.identifier, payload);
			break;
		case "teams":
			await sendTeamsWebhook(destination.identifier, payload);
			break;
		case "telegram": {
			const config = destination.config ?? {};
			const chatId = (config.chatId as string) ?? destination.identifier;
			await sendTelegramMessage(destination.identifier, chatId, payload);
			break;
		}
		case "google_chat":
			await sendGoogleChatWebhook(destination.identifier, payload);
			break;
		case "webhook":
			await sendWebhook(destination.identifier, payload);
			break;
	}
}

export const alarmsRoute = new Elysia({ prefix: "/v1/alarms" })
	.use(useLogger())
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		return { user: session?.user ?? null };
	})
	.onBeforeHandle(({ user, set }) => {
		if (!user) {
			set.status = 401;
			return { success: false, error: "Authentication required", code: "AUTH_REQUIRED" };
		}
	})
	// GET /v1/alarms — list alarms for the current org
	.get("/", async ({ user, set }) => {
		try {
			const orgId = await getActiveOrganizationId(user!.id);
			if (!orgId) {
				set.status = 400;
				return { success: false, error: "No organization found" };
			}
			const rows = await db
				.select()
				.from(alarms)
				.where(eq(alarms.organizationId, orgId));
			return { success: true, data: rows };
		} catch (err) {
			captureError(err);
			set.status = 500;
			return { success: false, error: "Failed to fetch alarms" };
		}
	})
	// GET /v1/alarms/stats — MUST be before /:id
	.get("/stats", async ({ user, set }) => {
		try {
			const orgId = await getActiveOrganizationId(user!.id);
			if (!orgId) {
				set.status = 400;
				return { success: false, error: "No organization found" };
			}
			const rows = await db
				.select()
				.from(alarms)
				.where(eq(alarms.organizationId, orgId));
			const total = rows.length;
			const enabled = rows.filter((r) => r.enabled).length;
			const disabled = total - enabled;
			return { success: true, data: { total, enabled, disabled } };
		} catch (err) {
			captureError(err);
			set.status = 500;
			return { success: false, error: "Failed to fetch alarm stats" };
		}
	})
	// GET /v1/alarms/:id
	.get("/:id", async ({ params, user, set }) => {
		try {
			const orgId = await getActiveOrganizationId(user!.id);
			if (!orgId) {
				set.status = 400;
				return { success: false, error: "No organization found" };
			}
			const [alarm] = await db
				.select()
				.from(alarms)
				.where(and(eq(alarms.id, params.id), eq(alarms.organizationId, orgId)));
			if (!alarm) {
				set.status = 404;
				return { success: false, error: "Alarm not found" };
			}
			const destinations = await db
				.select()
				.from(alarmDestinations)
				.where(eq(alarmDestinations.alarmId, alarm.id));
			return { success: true, data: { ...alarm, destinations } };
		} catch (err) {
			captureError(err);
			set.status = 500;
			return { success: false, error: "Failed to fetch alarm" };
		}
	}, { params: t.Object({ id: t.String() }) })
	// POST /v1/alarms — create
	.post("/", async ({ body, user, set }) => {
		try {
			const orgId = await getActiveOrganizationId(user!.id);
			if (!orgId) {
				set.status = 400;
				return { success: false, error: "No organization found" };
			}
			const id = generateId();
			const [alarm] = await db
				.insert(alarms)
				.values({
					id,
					organizationId: orgId,
					websiteId: body.websiteId ?? null,
					name: body.name,
					description: body.description ?? null,
					triggerType: body.triggerType,
					triggerConditions: body.triggerConditions ?? {},
					enabled: true,
				})
				.returning();
			if (body.destinations?.length) {
				await db.insert(alarmDestinations).values(
					body.destinations.map((d) => ({
						id: generateId(),
						alarmId: id,
						type: d.type,
						identifier: d.identifier,
						config: d.config ?? {},
					}))
				);
			}
			return { success: true, data: alarm };
		} catch (err) {
			captureError(err);
			set.status = 500;
			return { success: false, error: "Failed to create alarm" };
		}
	}, { body: CreateAlarmBody })
	// PUT /v1/alarms/:id — update (ownership enforced)
	.put("/:id", async ({ params, body, user, set }) => {
		try {
			const orgId = await getActiveOrganizationId(user!.id);
			if (!orgId) {
				set.status = 400;
				return { success: false, error: "No organization found" };
			}
			const [existing] = await db
				.select()
				.from(alarms)
				.where(and(eq(alarms.id, params.id), eq(alarms.organizationId, orgId)));
			if (!existing) {
				set.status = 404;
				return { success: false, error: "Alarm not found" };
			}
			const updates: Partial<typeof existing> = {};
			if (body.name !== undefined) updates.name = body.name;
			if (body.description !== undefined) updates.description = body.description;
			if (body.enabled !== undefined) updates.enabled = body.enabled;
			if (body.triggerType !== undefined) updates.triggerType = body.triggerType;
			if (body.triggerConditions !== undefined) updates.triggerConditions = body.triggerConditions;

			const [updated] = await db
				.update(alarms)
				.set({ ...updates, updatedAt: new Date() })
				.where(and(eq(alarms.id, params.id), eq(alarms.organizationId, orgId)))
				.returning();

			if (body.destinations !== undefined) {
				await db.delete(alarmDestinations).where(eq(alarmDestinations.alarmId, params.id));
				if (body.destinations.length > 0) {
					await db.insert(alarmDestinations).values(
						body.destinations.map((d) => ({
							id: generateId(),
							alarmId: params.id,
							type: d.type,
							identifier: d.identifier,
							config: d.config ?? {},
						}))
					);
				}
			}
			return { success: true, data: updated };
		} catch (err) {
			captureError(err);
			set.status = 500;
			return { success: false, error: "Failed to update alarm" };
		}
	}, { params: t.Object({ id: t.String() }), body: UpdateAlarmBody })
	// DELETE /v1/alarms/:id (ownership enforced)
	.delete("/:id", async ({ params, user, set }) => {
		try {
			const orgId = await getActiveOrganizationId(user!.id);
			if (!orgId) {
				set.status = 400;
				return { success: false, error: "No organization found" };
			}
			const [existing] = await db
				.select()
				.from(alarms)
				.where(and(eq(alarms.id, params.id), eq(alarms.organizationId, orgId)));
			if (!existing) {
				set.status = 404;
				return { success: false, error: "Alarm not found" };
			}
			await db.delete(alarms).where(and(eq(alarms.id, params.id), eq(alarms.organizationId, orgId)));
			return { success: true };
		} catch (err) {
			captureError(err);
			set.status = 500;
			return { success: false, error: "Failed to delete alarm" };
		}
	}, { params: t.Object({ id: t.String() }) })
	// POST /v1/alarms/:id/toggle (ownership enforced)
	.post("/:id/toggle", async ({ params, user, set }) => {
		try {
			const orgId = await getActiveOrganizationId(user!.id);
			if (!orgId) {
				set.status = 400;
				return { success: false, error: "No organization found" };
			}
			const [existing] = await db
				.select()
				.from(alarms)
				.where(and(eq(alarms.id, params.id), eq(alarms.organizationId, orgId)));
			if (!existing) {
				set.status = 404;
				return { success: false, error: "Alarm not found" };
			}
			const [updated] = await db
				.update(alarms)
				.set({ enabled: !existing.enabled, updatedAt: new Date() })
				.where(and(eq(alarms.id, params.id), eq(alarms.organizationId, orgId)))
				.returning();
			return { success: true, data: updated };
		} catch (err) {
			captureError(err);
			set.status = 500;
			return { success: false, error: "Failed to toggle alarm" };
		}
	}, { params: t.Object({ id: t.String() }) })
	// POST /v1/alarms/:id/test — send test notification
	.post("/:id/test", async ({ params, user, set }) => {
		try {
			const orgId = await getActiveOrganizationId(user!.id);
			if (!orgId) {
				set.status = 400;
				return { success: false, error: "No organization found" };
			}
			const [alarm] = await db
				.select()
				.from(alarms)
				.where(and(eq(alarms.id, params.id), eq(alarms.organizationId, orgId)));
			if (!alarm) {
				set.status = 404;
				return { success: false, error: "Alarm not found" };
			}
			const destinations = await db
				.select()
				.from(alarmDestinations)
				.where(eq(alarmDestinations.alarmId, params.id));
			await Promise.allSettled(
				destinations.map((d) =>
					sendTestNotification(
						{ type: d.type, identifier: d.identifier, config: (d.config as Record<string, unknown>) ?? {} },
						alarm.name
					)
				)
			);
			return { success: true, message: "Test notifications sent" };
		} catch (err) {
			captureError(err);
			set.status = 500;
			return { success: false, error: "Failed to send test notifications" };
		}
	}, { params: t.Object({ id: t.String() }) });
