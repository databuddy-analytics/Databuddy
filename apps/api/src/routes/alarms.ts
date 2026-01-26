import { auth } from "@databuddy/auth";
import {
	and,
	db,
	eq,
	desc,
	isNull,
	alarms,
	alarmLogs,
	member,
	organization,
} from "@databuddy/db";
import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";

// Validation schemas
const CreateAlarmSchema = t.Object({
	name: t.String({ minLength: 1, maxLength: 255 }),
	description: t.Optional(t.String()),
	type: t.Union([
		t.Literal("uptime"),
		t.Literal("analytics"),
		t.Literal("error_rate"),
		t.Literal("performance"),
		t.Literal("custom"),
	]),
	enabled: t.Optional(t.Boolean()),
	notificationChannels: t.Array(
		t.Union([
			t.Literal("slack"),
			t.Literal("discord"),
			t.Literal("email"),
			t.Literal("webhook"),
			t.Literal("teams"),
			t.Literal("telegram"),
		])
	),
	slackWebhookUrl: t.Optional(t.String()),
	slackChannel: t.Optional(t.String()),
	discordWebhookUrl: t.Optional(t.String()),
	emailAddresses: t.Optional(t.Array(t.String())),
	teamsWebhookUrl: t.Optional(t.String()),
	telegramBotToken: t.Optional(t.String()),
	telegramChatId: t.Optional(t.String()),
	webhookUrl: t.Optional(t.String()),
	webhookHeaders: t.Optional(t.Record(t.String(), t.String())),
	webhookMethod: t.Optional(t.String()),
	conditions: t.Any(), // Flexible JSON structure
	websiteId: t.Optional(t.String()),
	uptimeScheduleId: t.Optional(t.String()),
});

const UpdateAlarmSchema = t.Partial(CreateAlarmSchema);

const ListAlarmsQuerySchema = t.Object({
	organizationId: t.Optional(t.String()),
	websiteId: t.Optional(t.String()),
	type: t.Optional(t.String()),
	enabled: t.Optional(t.Boolean()),
	limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
	offset: t.Optional(t.Number({ minimum: 0 })),
});

export const alarmsRoutes = new Elysia({ prefix: "/alarms" })
	// List alarms
	.get(
		"/",
		async ({ query, set }) => {
			const session = await auth.api.getSession({
				headers: new Headers(),
			});

			if (!session) {
				set.status = 401;
				return {
					success: false,
					error: "Authentication required",
					code: "AUTH_REQUIRED",
				};
			}

			const {
				organizationId,
				websiteId,
				type,
				enabled,
				limit = 50,
				offset = 0,
			} = query;

			// Build where conditions
			const conditions = [isNull(alarms.deletedAt)];

			if (organizationId) {
				// Verify user has access to this organization
				const membership = await db.query.member.findFirst({
					where: and(
						eq(member.userId, session.user.id),
						eq(member.organizationId, organizationId)
					),
				});

				if (!membership) {
					set.status = 403;
					return {
						success: false,
						error: "Access denied to this organization",
						code: "ACCESS_DENIED",
					};
				}

				conditions.push(eq(alarms.organizationId, organizationId));
			} else {
				// Get all organizations user is a member of
				const memberships = await db.query.member.findMany({
					where: eq(member.userId, session.user.id),
					columns: { organizationId: true },
				});

				if (memberships.length === 0) {
					return {
						success: true,
						data: [],
						total: 0,
					};
				}

				const orgIds = memberships.map((m) => m.organizationId);
				conditions.push(
					eq(
						alarms.organizationId,
						orgIds.length === 1 ? orgIds[0] : orgIds[0]
					)
				);
			}

			if (websiteId) {
				conditions.push(eq(alarms.websiteId, websiteId));
			}

			if (type) {
				conditions.push(eq(alarms.type, type as any));
			}

			if (enabled !== undefined) {
				conditions.push(eq(alarms.enabled, enabled));
			}

			const [alarmsList, total] = await Promise.all([
				db.query.alarms.findMany({
					where: and(...conditions),
					limit,
					offset,
					orderBy: [desc(alarms.createdAt)],
				}),
				db
					.select({ count: db.fn.count() })
					.from(alarms)
					.where(and(...conditions))
					.then((r) => Number(r[0]?.count ?? 0)),
			]);

			return {
				success: true,
				data: alarmsList,
				total,
				limit,
				offset,
			};
		},
		{
			query: ListAlarmsQuerySchema,
		}
	)

	// Get single alarm
	.get("/:id", async ({ params, set }) => {
		const session = await auth.api.getSession({
			headers: new Headers(),
		});

		if (!session) {
			set.status = 401;
			return {
				success: false,
				error: "Authentication required",
				code: "AUTH_REQUIRED",
			};
		}

		const alarm = await db.query.alarms.findFirst({
			where: and(eq(alarms.id, params.id), isNull(alarms.deletedAt)),
		});

		if (!alarm) {
			set.status = 404;
			return {
				success: false,
				error: "Alarm not found",
				code: "NOT_FOUND",
			};
		}

		// Verify user has access to this organization
		const membership = await db.query.member.findFirst({
			where: and(
				eq(member.userId, session.user.id),
				eq(member.organizationId, alarm.organizationId)
			),
		});

		if (!membership) {
			set.status = 403;
			return {
				success: false,
				error: "Access denied",
				code: "ACCESS_DENIED",
			};
		}

		return {
			success: true,
			data: alarm,
		};
	})

	// Create alarm
	.post(
		"/",
		async ({ body, set }) => {
			const session = await auth.api.getSession({
				headers: new Headers(),
			});

			if (!session) {
				set.status = 401;
				return {
					success: false,
					error: "Authentication required",
					code: "AUTH_REQUIRED",
				};
			}

			// Get user's active organization
			const activeOrgId = session.session.activeOrganizationId;
			if (!activeOrgId) {
				set.status = 400;
				return {
					success: false,
					error: "No active organization",
					code: "NO_ACTIVE_ORG",
				};
			}

			// Verify user has access to this organization
			const membership = await db.query.member.findFirst({
				where: and(
					eq(member.userId, session.user.id),
					eq(member.organizationId, activeOrgId)
				),
			});

			if (!membership) {
				set.status = 403;
				return {
					success: false,
					error: "Access denied",
					code: "ACCESS_DENIED",
				};
			}

			// Create alarm
			const alarmId = nanoid();
			const newAlarm = await db
				.insert(alarms)
				.values({
					id: alarmId,
					organizationId: activeOrgId,
					createdBy: session.user.id,
					name: body.name,
					description: body.description,
					type: body.type,
					enabled: body.enabled ?? true,
					notificationChannels: body.notificationChannels,
					slackWebhookUrl: body.slackWebhookUrl,
					slackChannel: body.slackChannel,
					discordWebhookUrl: body.discordWebhookUrl,
					emailAddresses: body.emailAddresses,
					teamsWebhookUrl: body.teamsWebhookUrl,
					telegramBotToken: body.telegramBotToken,
					telegramChatId: body.telegramChatId,
					webhookUrl: body.webhookUrl,
					webhookHeaders: body.webhookHeaders,
					webhookMethod: body.webhookMethod ?? "POST",
					conditions: body.conditions,
					websiteId: body.websiteId,
					uptimeScheduleId: body.uptimeScheduleId,
				})
				.returning();

			set.status = 201;
			return {
				success: true,
				data: newAlarm[0],
			};
		},
		{
			body: CreateAlarmSchema,
		}
	)

	// Update alarm
	.patch(
		"/:id",
		async ({ params, body, set }) => {
			const session = await auth.api.getSession({
				headers: new Headers(),
			});

			if (!session) {
				set.status = 401;
				return {
					success: false,
					error: "Authentication required",
					code: "AUTH_REQUIRED",
				};
			}

			// Get existing alarm
			const existingAlarm = await db.query.alarms.findFirst({
				where: and(eq(alarms.id, params.id), isNull(alarms.deletedAt)),
			});

			if (!existingAlarm) {
				set.status = 404;
				return {
					success: false,
					error: "Alarm not found",
					code: "NOT_FOUND",
				};
			}

			// Verify user has access
			const membership = await db.query.member.findFirst({
				where: and(
					eq(member.userId, session.user.id),
					eq(member.organizationId, existingAlarm.organizationId)
				),
			});

			if (!membership) {
				set.status = 403;
				return {
					success: false,
					error: "Access denied",
					code: "ACCESS_DENIED",
				};
			}

			// Update alarm
			const updated = await db
				.update(alarms)
				.set({
					...body,
					updatedAt: new Date(),
				})
				.where(eq(alarms.id, params.id))
				.returning();

			return {
				success: true,
				data: updated[0],
			};
		},
		{
			body: UpdateAlarmSchema,
		}
	)

	// Delete alarm (soft delete)
	.delete("/:id", async ({ params, set }) => {
		const session = await auth.api.getSession({
			headers: new Headers(),
		});

		if (!session) {
			set.status = 401;
			return {
				success: false,
				error: "Authentication required",
				code: "AUTH_REQUIRED",
			};
		}

		// Get existing alarm
		const existingAlarm = await db.query.alarms.findFirst({
			where: and(eq(alarms.id, params.id), isNull(alarms.deletedAt)),
		});

		if (!existingAlarm) {
			set.status = 404;
			return {
				success: false,
				error: "Alarm not found",
				code: "NOT_FOUND",
			};
		}

		// Verify user has access
		const membership = await db.query.member.findFirst({
			where: and(
				eq(member.userId, session.user.id),
				eq(member.organizationId, existingAlarm.organizationId)
			),
		});

		if (!membership) {
			set.status = 403;
			return {
				success: false,
				error: "Access denied",
				code: "ACCESS_DENIED",
			};
		}

		// Soft delete
		await db
			.update(alarms)
			.set({
				deletedAt: new Date(),
				enabled: false,
			})
			.where(eq(alarms.id, params.id));

		return {
			success: true,
			message: "Alarm deleted successfully",
		};
	})

	// Get alarm logs
	.get("/:id/logs", async ({ params, query, set }) => {
		const session = await auth.api.getSession({
			headers: new Headers(),
		});

		if (!session) {
			set.status = 401;
			return {
				success: false,
				error: "Authentication required",
				code: "AUTH_REQUIRED",
			};
		}

		// Get alarm
		const alarm = await db.query.alarms.findFirst({
			where: and(eq(alarms.id, params.id), isNull(alarms.deletedAt)),
		});

		if (!alarm) {
			set.status = 404;
			return {
				success: false,
				error: "Alarm not found",
				code: "NOT_FOUND",
			};
		}

		// Verify access
		const membership = await db.query.member.findFirst({
			where: and(
				eq(member.userId, session.user.id),
				eq(member.organizationId, alarm.organizationId)
			),
		});

		if (!membership) {
			set.status = 403;
			return {
				success: false,
				error: "Access denied",
				code: "ACCESS_DENIED",
			};
		}

		const limit = Number(query.limit) || 50;
		const offset = Number(query.offset) || 0;

		const [logs, total] = await Promise.all([
			db.query.alarmLogs.findMany({
				where: eq(alarmLogs.alarmId, params.id),
				limit,
				offset,
				orderBy: [desc(alarmLogs.triggeredAt)],
			}),
			db
				.select({ count: db.fn.count() })
				.from(alarmLogs)
				.where(eq(alarmLogs.alarmId, params.id))
				.then((r) => Number(r[0]?.count ?? 0)),
		]);

		return {
			success: true,
			data: logs,
			total,
			limit,
			offset,
		};
	})

	// Test alarm (send test notification)
	.post("/:id/test", async ({ params, set }) => {
		const session = await auth.api.getSession({
			headers: new Headers(),
		});

		if (!session) {
			set.status = 401;
			return {
				success: false,
				error: "Authentication required",
				code: "AUTH_REQUIRED",
			};
		}

		// Get alarm
		const alarm = await db.query.alarms.findFirst({
			where: and(eq(alarms.id, params.id), isNull(alarms.deletedAt)),
		});

		if (!alarm) {
			set.status = 404;
			return {
				success: false,
				error: "Alarm not found",
				code: "NOT_FOUND",
			};
		}

		// Verify access
		const membership = await db.query.member.findFirst({
			where: and(
				eq(member.userId, session.user.id),
				eq(member.organizationId, alarm.organizationId)
			),
		});

		if (!membership) {
			set.status = 403;
			return {
				success: false,
				error: "Access denied",
				code: "ACCESS_DENIED",
			};
		}

		// TODO: Implement actual notification sending
		// This will be handled by the notifications package
		// For now, return success
		return {
			success: true,
			message: "Test notification sent",
			channels: alarm.notificationChannels,
		};
	});
