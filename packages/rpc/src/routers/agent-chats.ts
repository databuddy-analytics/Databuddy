import { and, desc, eq } from "@databuddy/db";
import { agentChats } from "@databuddy/db/schema";
import { getActiveStream } from "@databuddy/redis/stream-buffer";
import { z } from "zod";
import { rpcError } from "../errors";
import { sessionProcedure, trackedSessionProcedure } from "../orpc";
import {
	withWorkspace,
	workspaceInputSchema,
} from "../procedures/with-workspace";

const chatListItemSchema = z.object({
	id: z.string(),
	websiteId: z.string().nullable(),
	title: z.string(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const chatDetailSchema = chatListItemSchema.extend({
	messages: z.array(z.unknown()),
	activeStreamId: z.string().nullable(),
});

const successOutputSchema = z.object({ success: z.literal(true) });

const MAX_LIST = 100;

export const agentChatsRouter = {
	list: sessionProcedure
		.route({
			method: "POST",
			path: "/agent-chats/list",
			summary: "List agent chats for the current user and organization",
			tags: ["AgentChats"],
		})
		.input(workspaceInputSchema)
		.output(z.array(chatListItemSchema))
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["read"],
			});

			const rows = await context.db
				.select({
					id: agentChats.id,
					websiteId: agentChats.websiteId,
					title: agentChats.title,
					createdAt: agentChats.createdAt,
					updatedAt: agentChats.updatedAt,
				})
				.from(agentChats)
				.where(
					and(
						eq(agentChats.userId, context.user.id),
						eq(agentChats.organizationId, workspace.organizationId)
					)
				)
				.orderBy(desc(agentChats.updatedAt))
				.limit(MAX_LIST);

			return rows;
		}),

	get: sessionProcedure
		.route({
			method: "POST",
			path: "/agent-chats/get",
			summary: "Get a single agent chat with messages",
			tags: ["AgentChats"],
		})
		.input(z.object({ id: z.string() }))
		.output(chatDetailSchema.nullable())
		.handler(async ({ context, input }) => {
			const row = await context.db.query.agentChats.findFirst({
				where: { id: input.id, userId: context.user.id },
			});

			if (!row) {
				return null;
			}

			if (row.organizationId) {
				await withWorkspace(context, {
					organizationId: row.organizationId,
					resource: "organization",
					permissions: ["read"],
				});
			}

			const activeStreamId = await getActiveStream(row.userId, row.id);

			return {
				id: row.id,
				websiteId: row.websiteId,
				title: row.title,
				messages: row.messages,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
				activeStreamId,
			};
		}),

	rename: trackedSessionProcedure
		.route({
			method: "POST",
			path: "/agent-chats/rename",
			summary: "Rename an agent chat",
			tags: ["AgentChats"],
		})
		.input(
			z.object({
				id: z.string(),
				title: z.string().min(1).max(120).trim(),
			})
		)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const row = await context.db.query.agentChats.findFirst({
				where: { id: input.id, userId: context.user.id },
				columns: { id: true, organizationId: true },
			});

			if (!row) {
				throw rpcError.notFound("agent chat", input.id);
			}

			if (row.organizationId) {
				await withWorkspace(context, {
					organizationId: row.organizationId,
					resource: "organization",
					permissions: ["read"],
				});
			}

			await context.db
				.update(agentChats)
				.set({ title: input.title, updatedAt: new Date() })
				.where(eq(agentChats.id, input.id));

			return { success: true };
		}),

	delete: trackedSessionProcedure
		.route({
			method: "POST",
			path: "/agent-chats/delete",
			summary: "Delete an agent chat",
			tags: ["AgentChats"],
		})
		.input(z.object({ id: z.string() }))
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const row = await context.db.query.agentChats.findFirst({
				where: { id: input.id, userId: context.user.id },
				columns: { id: true, organizationId: true },
			});

			if (!row) {
				throw rpcError.notFound("agent chat", input.id);
			}

			if (row.organizationId) {
				await withWorkspace(context, {
					organizationId: row.organizationId,
					resource: "organization",
					permissions: ["read"],
				});
			}

			await context.db.delete(agentChats).where(eq(agentChats.id, input.id));

			return { success: true };
		}),
};
