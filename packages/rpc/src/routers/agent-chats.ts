import { and, desc, eq } from "@databuddy/db";
import { agentChats, analyticsInsights } from "@databuddy/db/schema";
import { z } from "zod";
import { rpcError } from "../errors";
import { sessionProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const chatListItemSchema = z.object({
	id: z.string(),
	websiteId: z.string(),
	title: z.string(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const chatDetailSchema = chatListItemSchema.extend({
	messages: z.array(z.unknown()),
});

const successOutputSchema = z.object({ success: z.literal(true) });

const promptSuggestionSchema = z.object({
	label: z.string(),
	prompt: z.string(),
	source: z.enum(["insight", "default"]),
});

const MAX_LIST = 100;
const MAX_INSIGHT_PROMPTS = 4;
const LABEL_MAX_LEN = 60;
const PROMPT_MAX_LEN = 240;

const FALLBACK_PROMPTS: Array<{ label: string; prompt: string }> = [
	{
		label: "Analyze traffic trends",
		prompt:
			"Analyze my traffic trends over the last 30 days and tell me what stands out.",
	},
	{
		label: "Why is bounce rate up?",
		prompt: "What's causing my bounce rate to increase?",
	},
	{
		label: "Weekly performance report",
		prompt:
			"Generate a weekly performance report covering traffic, sources, top pages, and conversions.",
	},
	{
		label: "Best converting sources",
		prompt: "Find my best converting traffic sources from the last 30 days.",
	},
];

export const agentChatsRouter = {
	list: sessionProcedure
		.route({
			method: "POST",
			path: "/agent-chats/list",
			summary: "List agent chats for the current user and website",
			tags: ["AgentChats"],
		})
		.input(z.object({ websiteId: z.string() }))
		.output(z.array(chatListItemSchema))
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
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
						eq(agentChats.websiteId, input.websiteId)
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
				where: and(
					eq(agentChats.id, input.id),
					eq(agentChats.userId, context.user.id)
				),
			});

			if (!row) {
				return null;
			}

			await withWorkspace(context, {
				websiteId: row.websiteId,
				permissions: ["read"],
			});

			return {
				id: row.id,
				websiteId: row.websiteId,
				title: row.title,
				messages: row.messages,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			};
		}),

	rename: sessionProcedure
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
				where: and(
					eq(agentChats.id, input.id),
					eq(agentChats.userId, context.user.id)
				),
				columns: { id: true, websiteId: true },
			});

			if (!row) {
				throw rpcError.notFound("agent chat", input.id);
			}

			await withWorkspace(context, {
				websiteId: row.websiteId,
				permissions: ["update"],
			});

			await context.db
				.update(agentChats)
				.set({ title: input.title, updatedAt: new Date() })
				.where(eq(agentChats.id, input.id));

			return { success: true };
		}),

	delete: sessionProcedure
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
				where: and(
					eq(agentChats.id, input.id),
					eq(agentChats.userId, context.user.id)
				),
				columns: { id: true, websiteId: true },
			});

			if (!row) {
				throw rpcError.notFound("agent chat", input.id);
			}

			await withWorkspace(context, {
				websiteId: row.websiteId,
				permissions: ["delete"],
			});

			await context.db.delete(agentChats).where(eq(agentChats.id, input.id));

			return { success: true };
		}),

	suggestedPrompts: sessionProcedure
		.route({
			method: "POST",
			path: "/agent-chats/suggestedPrompts",
			summary:
				"Returns context-aware prompt suggestions seeded from recent insights",
			tags: ["AgentChats"],
		})
		.input(z.object({ websiteId: z.string() }))
		.output(z.array(promptSuggestionSchema))
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			const insights = await context.db
				.select({
					title: analyticsInsights.title,
					description: analyticsInsights.description,
					severity: analyticsInsights.severity,
				})
				.from(analyticsInsights)
				.where(eq(analyticsInsights.websiteId, input.websiteId))
				.orderBy(desc(analyticsInsights.createdAt))
				.limit(MAX_INSIGHT_PROMPTS);

			const fromInsights = insights.map((row) => ({
				label: row.title.slice(0, LABEL_MAX_LEN),
				prompt: `${row.title}. ${row.description}`.slice(0, PROMPT_MAX_LEN),
				source: "insight" as const,
			}));

			if (fromInsights.length >= MAX_INSIGHT_PROMPTS) {
				return fromInsights;
			}

			const fillers = FALLBACK_PROMPTS.slice(
				0,
				MAX_INSIGHT_PROMPTS - fromInsights.length
			).map((p) => ({ ...p, source: "default" as const }));

			return [...fromInsights, ...fillers];
		}),
};
