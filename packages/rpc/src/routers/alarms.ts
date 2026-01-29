import { and, desc, eq, alarms, type InferSelectModel } from "@databuddy/db";
import { createId } from "@databuddy/shared/utils/ids";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "../orpc";
import {
	alarmSchemas,
	createAlarmHandlers,
	type AlarmStore,
	type CreateAlarmInput,
	type ListAlarmInput,
	type UpdateAlarmInput,
} from "./alarms-shared";

const {
	createAlarmInputSchema,
	updateAlarmInputSchema,
	listAlarmsInputSchema,
	alarmIdSchema,
} = alarmSchemas;

type AlarmRecord = InferSelectModel<typeof alarms>;

function createAlarmStore(db: typeof import("@databuddy/db").db): AlarmStore<AlarmRecord> {
	return {
		list: async (userId: string, filters: ListAlarmInput) => {
			const conditions = [eq(alarms.userId, userId)];
			if (filters.organizationId) {
				conditions.push(eq(alarms.organizationId, filters.organizationId));
			}
			if (filters.websiteId) {
				conditions.push(eq(alarms.websiteId, filters.websiteId));
			}
			const whereClause =
				conditions.length > 1 ? and(...conditions) : conditions[0];
			return await db.query.alarms.findMany({
				where: whereClause,
				orderBy: (table) => [desc(table.updatedAt)],
			});
		},
		get: async (userId: string, id: string) => {
			return await db.query.alarms.findFirst({
				where: and(eq(alarms.id, id), eq(alarms.userId, userId)),
			});
		},
		create: async (userId: string, input: CreateAlarmInput) => {
			const now = new Date();
			const [alarm] = await db
				.insert(alarms)
				.values({
					id: createId("NANOID"),
					userId,
					organizationId: input.organizationId,
					websiteId: input.websiteId ?? null,
					name: input.name,
					description: input.description ?? null,
					enabled: input.enabled ?? true,
					notificationChannels: input.notificationChannels,
					slackWebhookUrl: input.slackWebhookUrl ?? null,
					discordWebhookUrl: input.discordWebhookUrl ?? null,
					emailAddresses: input.emailAddresses,
					webhookUrl: input.webhookUrl ?? null,
					webhookHeaders: input.webhookHeaders,
					triggerType: input.triggerType,
					triggerConditions: input.triggerConditions,
					createdAt: now,
					updatedAt: now,
				})
				.returning();
			if (!alarm) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to create alarm",
				});
			}
			return alarm;
		},
		update: async (userId: string, input: UpdateAlarmInput) => {
			const updates: Partial<AlarmRecord> = { updatedAt: new Date() };
			if (input.organizationId) {
				updates.organizationId = input.organizationId;
			}
			if (input.websiteId !== undefined) {
				updates.websiteId = input.websiteId ?? null;
			}
			if (input.name !== undefined) {
				updates.name = input.name;
			}
			if (input.description !== undefined) {
				updates.description = input.description ?? null;
			}
			if (input.enabled !== undefined) {
				updates.enabled = input.enabled;
			}
			if (input.notificationChannels) {
				updates.notificationChannels = input.notificationChannels;
			}
			if (input.slackWebhookUrl !== undefined) {
				updates.slackWebhookUrl = input.slackWebhookUrl ?? null;
			}
			if (input.discordWebhookUrl !== undefined) {
				updates.discordWebhookUrl = input.discordWebhookUrl ?? null;
			}
			if (input.emailAddresses) {
				updates.emailAddresses = input.emailAddresses;
			}
			if (input.webhookUrl !== undefined) {
				updates.webhookUrl = input.webhookUrl ?? null;
			}
			if (input.webhookHeaders) {
				updates.webhookHeaders = input.webhookHeaders;
			}
			if (input.triggerType) {
				updates.triggerType = input.triggerType;
			}
			if (input.triggerConditions) {
				updates.triggerConditions = input.triggerConditions;
			}
			const [updated] = await db
				.update(alarms)
				.set(updates)
				.where(and(eq(alarms.id, input.id), eq(alarms.userId, userId)))
				.returning();
			return updated ?? null;
		},
		delete: async (userId: string, id: string) => {
			const [deleted] = await db
				.delete(alarms)
				.where(and(eq(alarms.id, id), eq(alarms.userId, userId)))
				.returning();
			return deleted ?? null;
		},
	};
}

export const alarmsRouter = {
	list: protectedProcedure
		.input(listAlarmsInputSchema)
		.handler(async ({ context, input }) => {
			const handlers = createAlarmHandlers(createAlarmStore(context.db));
			return await handlers.list(context.user.id, input);
		}),

	get: protectedProcedure
		.input(alarmIdSchema)
		.handler(async ({ context, input }) => {
			const handlers = createAlarmHandlers(createAlarmStore(context.db));
			return await handlers.get(context.user.id, input.id);
		}),

	create: protectedProcedure
		.input(createAlarmInputSchema)
		.handler(async ({ context, input }) => {
			const handlers = createAlarmHandlers(createAlarmStore(context.db));
			return await handlers.create(context.user.id, input);
		}),

	update: protectedProcedure
		.input(updateAlarmInputSchema)
		.handler(async ({ context, input }) => {
			const handlers = createAlarmHandlers(createAlarmStore(context.db));
			return await handlers.update(context.user.id, input);
		}),

	delete: protectedProcedure
		.input(alarmIdSchema)
		.handler(async ({ context, input }) => {
			const handlers = createAlarmHandlers(createAlarmStore(context.db));
			return await handlers.delete(context.user.id, input.id);
		}),

	test: protectedProcedure
		.input(alarmIdSchema)
		.handler(async ({ context, input }) => {
			const handlers = createAlarmHandlers(createAlarmStore(context.db));
			return await handlers.test(context.user.id, input.id);
		}),
};

export { alarmSchemas } from "./alarms-shared";
