import { streamToEventIterator } from "@orpc/server";
import { convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { handleMessage, type Mode } from "../agent";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

const modeMap: Record<string, Mode> = {
	chat: "chat",
	agent: "agent",
	"agent-max": "agent_max",
};

export const chatRouter = {
	stream: protectedProcedure
		.input(
			z.object({
				conversationId: z.string().optional(),
				messages: z.array(
					z.object({
						role: z.enum(["user", "assistant"]),
						content: z.string(),
					})
				),
				websiteId: z.string(),
				model: z.enum(["chat", "agent", "agent-max"]).optional(),
			})
		)
		.handler(async ({ context, input }) => {
			// Validate and authorize website access
			const website = await authorizeWebsiteAccess(
				context,
				input.websiteId,
				"read"
			);

			// Convert UI messages to model messages
			const uiMessages: UIMessage[] = input.messages.map((msg) => ({
				id: crypto.randomUUID(),
				role: msg.role,
				parts: [{ type: "text" as const, text: msg.content }],
			}));

			const modelMessages = convertToModelMessages(uiMessages);

			// Determine mode
			const mode = input.model ? (modeMap[input.model] ?? "chat") : "chat";

			// Get the stream
			const stream = handleMessage(
				modelMessages,
				mode,
				input.websiteId,
				website.domain || ""
			);

			// Convert to event iterator for oRPC
			return streamToEventIterator(stream);
		}),
};
