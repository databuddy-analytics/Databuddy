import { RedisProvider } from "@ai-sdk-tools/memory/redis";
import { redis } from "@databuddy/redis";
import type { RedisClientType } from "redis";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

const memoryProvider = new RedisProvider(redis as unknown as RedisClientType);

export const agentRouter = {
	getMessages: protectedProcedure
		.input(
			z.object({
				chatId: z.string(),
				websiteId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			const messages = await memoryProvider.getMessages({
				chatId: input.chatId,
				limit: 50,
			});

			return {
				success: true,
				messages: messages ?? [],
			};
		}),

	addFeedback: protectedProcedure
		.input(
			z.object({
				chatId: z.string(),
				messageId: z.string(),
				websiteId: z.string(),
				type: z.enum(["positive", "negative"]),
				comment: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			// TODO: Store feedback in database or cache

			return {
				success: true,
			};
		}),

	deleteFeedback: protectedProcedure
		.input(
			z.object({
				chatId: z.string(),
				messageId: z.string(),
				websiteId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			// TODO: Delete feedback from database or cache

			return {
				success: true,
			};
		}),
};
