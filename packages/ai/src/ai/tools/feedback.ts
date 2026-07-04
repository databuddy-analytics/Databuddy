import { ratelimit } from "@databuddy/redis/rate-limit";
import { submitFeedback } from "@databuddy/services/feedback";
import { tool } from "ai";
import { z } from "zod";
import type { AppContext } from "../config/context";
import { createToolLogger, getAppContext } from "./utils";

const logger = createToolLogger("Feedback Tools");

const RATE_LIMIT_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

const feedbackCategorySchema = z.enum([
	"bug_report",
	"feature_request",
	"ux_improvement",
	"performance",
	"documentation",
	"other",
]);

const submitFeedbackInputSchema = z.object({
	title: z.string().min(3).max(200),
	description: z.string().min(10).max(5000),
	category: feedbackCategorySchema,
	websiteId: z.string().optional(),
	errorDetails: z.string().max(2000).optional(),
});

interface ResolvedFeedbackWebsite {
	unverifiedWebsite: string | null;
	websiteDomain: string | null;
	websiteId: string | null;
}

function resolveFeedbackSource(ctx: AppContext): "agent" | "slack" | "mcp" {
	if (ctx.source === "slack") {
		return "slack";
	}
	if (ctx.source === "mcp") {
		return "mcp";
	}
	return "agent";
}

function resolveFeedbackWebsite(
	ctx: AppContext,
	inputWebsiteId?: string
): ResolvedFeedbackWebsite {
	const accessible = ctx.accessibleWebsites ?? [];
	const contextId = ctx.defaultWebsiteId || ctx.websiteId || null;

	if (!inputWebsiteId || inputWebsiteId === contextId) {
		if (!contextId) {
			return { unverifiedWebsite: null, websiteDomain: null, websiteId: null };
		}
		const contextDomain =
			ctx.websiteDomain ||
			accessible.find((w) => w.id === contextId)?.domain ||
			null;
		return {
			unverifiedWebsite: null,
			websiteDomain: contextDomain,
			websiteId: contextId,
		};
	}

	const match = accessible.find((w) => w.id === inputWebsiteId);
	if (match) {
		return {
			unverifiedWebsite: null,
			websiteDomain: match.domain ?? null,
			websiteId: match.id,
		};
	}

	return {
		unverifiedWebsite: inputWebsiteId,
		websiteDomain: null,
		websiteId: null,
	};
}

export function createFeedbackTools() {
	const submitFeedbackTool = tool({
		description:
			"Send product feedback about Databuddy itself to the Databuddy team on the user's behalf: bug reports, feature requests, or errors that block them. Offer this when the user says something in Databuddy looks broken, asks for a capability that does not exist, or keeps hitting an unrecoverable error. An explicit ask to pass it on ('send this to the team', 'report this', 'file a bug') is agreement: call this immediately without asking again. Describing a problem alone is not an ask: offer first and call only once they say yes. One call submits. Write the title and description from the user's own words plus concrete context (the page or feature, the error text, what they expected). Issues on the user's own website are analytics questions, not product feedback.",
		inputSchema: submitFeedbackInputSchema,
		execute: async ({ errorDetails, websiteId, ...input }, options) => {
			const context = getAppContext(options);
			const userId = context.userId || context.apiKey?.userId;
			const organizationId =
				context.organizationId ?? context.apiKey?.organizationId;
			if (!(userId && organizationId)) {
				throw new Error("Feedback requires an organization workspace context.");
			}

			const site = resolveFeedbackWebsite(context, websiteId);

			if (context.mutationMode === "dry-run") {
				return {
					dryRun: true,
					message:
						"Dry-run mode blocked submit_feedback; no feedback was sent.",
					mutationBlocked: true,
					success: false,
				};
			}

			const rl = await ratelimit(
				`feedback:submit:${userId}:${organizationId}`,
				RATE_LIMIT_ATTEMPTS,
				RATE_LIMIT_WINDOW_SECONDS
			);
			if (!rl.success) {
				throw new Error(
					"Feedback rate limit reached (5 per hour). Ask the user to try again later."
				);
			}

			const metadata: Record<string, unknown> = {};
			if (errorDetails) {
				metadata.errorDetails = errorDetails;
			}
			if (site.unverifiedWebsite) {
				metadata.reportedWebsite = site.unverifiedWebsite;
			}

			try {
				const row = await submitFeedback({
					userId,
					organizationId,
					title: input.title,
					description: input.description,
					category: input.category,
					source: resolveFeedbackSource(context),
					websiteId: site.websiteId,
					websiteDomain: site.websiteDomain,
					conversationId: context.chatId || null,
					metadata: Object.keys(metadata).length > 0 ? metadata : null,
				});

				return {
					success: true,
					message: "Feedback sent to the Databuddy team.",
					feedbackId: row.id,
				};
			} catch (error) {
				logger.error("Failed to submit feedback", {
					organizationId,
					category: input.category,
					error,
				});
				throw error instanceof Error
					? error
					: new Error("Failed to send feedback. Please try again.");
			}
		},
	});

	return {
		submit_feedback: submitFeedbackTool,
	} as const;
}
