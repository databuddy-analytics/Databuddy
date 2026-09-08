import { roleHasPermission } from "@databuddy/auth/permissions";
import { and, db, eq, isNull } from "@databuddy/db";
import { websites } from "@databuddy/db/schema";
import {
	getInsightsQueue,
	INSIGHTS_BUSINESS_CONTEXT_JOB_NAME,
} from "@databuddy/redis";
import { ratelimit } from "@databuddy/redis/rate-limit";
import {
	beginBusinessContextGeneration,
	BusinessContextError,
	markBusinessContextGeneration,
	readOrganizationBusinessContext,
	saveOrganizationBusinessProfile,
} from "@databuddy/services/organization-business-context";
import {
	BUSINESS_CONTEXT_LIMIT,
	businessContextIsGenerating,
	businessContextSettingsSchema,
} from "@databuddy/shared/organization-business-context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { rpcError } from "../errors";
import { setAuditOrganization } from "../lib/audit";
import { logger } from "../lib/logger";
import { auditedProcedure, protectedProcedure, type Context } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const scope = z.object({ organizationId: z.string().min(1).max(256) }).strict();

function contextError(error: unknown): never {
	if (error instanceof BusinessContextError) {
		throw new ORPCError(error.code, { message: error.message });
	}
	throw error;
}

async function settings(context: Context, organizationId: string) {
	const workspace = await withWorkspace(context, {
		organizationId,
		resource: "organization",
		permissions: ["read"],
	});
	const [state, sites] = await Promise.all([
		readOrganizationBusinessContext(organizationId).catch(contextError),
		db
			.select({ id: websites.id, name: websites.name, domain: websites.domain })
			.from(websites)
			.where(
				and(
					eq(websites.organizationId, organizationId),
					isNull(websites.deletedAt)
				)
			)
			.orderBy(websites.name, websites.id),
	]);
	return {
		...state,
		websites: sites.map((site) => ({
			...site,
			name: site.name ?? site.domain,
		})),
		canEdit:
			workspace.role !== null &&
			roleHasPermission(workspace.role, "organization", ["update"]),
	};
}

export const businessContextRouter = {
	get: protectedProcedure
		.route({
			method: "POST",
			path: "/business-context/get",
			summary: "Read the organization's business context",
			tags: ["Organizations"],
		})
		.input(scope)
		.output(businessContextSettingsSchema)
		.handler(({ context, input }) => settings(context, input.organizationId)),
	save: auditedProcedure
		.route({
			method: "POST",
			path: "/business-context/save",
			summary: "Save business context",
			tags: ["Organizations"],
		})
		.input(
			scope.extend({
				revision: z.number().int().nonnegative(),
				content: z.string().trim().max(BUSINESS_CONTEXT_LIMIT),
				generationId: z.uuid().optional(),
			})
		)
		.output(businessContextSettingsSchema)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["update"],
			});
			setAuditOrganization(context, input.organizationId);
			await saveOrganizationBusinessProfile({
				...input,
				updatedBy: context.user?.id ?? "api",
			}).catch(contextError);
			return settings(context, input.organizationId);
		}),
	generate: auditedProcedure
		.route({
			method: "POST",
			path: "/business-context/generate",
			summary: "Generate a business context draft from a website",
			tags: ["Organizations"],
		})
		.input(scope.extend({ websiteId: z.string().min(1).max(256) }))
		.output(businessContextSettingsSchema)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["update"],
			});
			setAuditOrganization(context, input.organizationId);
			const current = await readOrganizationBusinessContext(
				input.organizationId
			).catch(contextError);
			if (!businessContextIsGenerating(current)) {
				const rate = await ratelimit(
					`business-context-generate:${input.organizationId}`,
					5,
					600
				);
				if (!rate.success) {
					throw rpcError.rateLimited(
						Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000))
					);
				}
			}
			const state = await beginBusinessContextGeneration({
				...input,
				requestedBy: context.user?.id ?? "",
			}).catch(contextError);
			if (state.generation?.status === "queued") {
				const generationId = state.generation.id;
				await getInsightsQueue()
					.add(
						INSIGHTS_BUSINESS_CONTEXT_JOB_NAME,
						{ organizationId: input.organizationId, generationId },
						{ jobId: `business-context-${generationId}`, attempts: 1 }
					)
					.catch(async (error) => {
						logger.error(
							{ error, organizationId: input.organizationId },
							"Business context generation could not be queued"
						);
						await markBusinessContextGeneration({
							organizationId: input.organizationId,
							generationId,
							status: "failed",
							error:
								"Generation could not start. Try again; your saved context is unchanged.",
						});
						throw rpcError.internal(
							"Could not start business context generation. Try again."
						);
					});
			}
			return settings(context, input.organizationId);
		}),
};
