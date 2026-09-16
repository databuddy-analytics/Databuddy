import { roleHasPermission } from "@databuddy/auth/permissions";
import { and, db, eq, isNull } from "@databuddy/db";
import { websites } from "@databuddy/db/schema";
import { ratelimit } from "@databuddy/redis/rate-limit";
import {
	beginBusinessContextGeneration,
	BusinessContextError,
	cancelBusinessContextGeneration,
	readOrganizationBusinessContext,
	restoreOrganizationBusinessProfile,
	saveOrganizationBusinessProfile,
} from "@databuddy/services/organization-business-context";
import {
	businessContextEditSchema,
	businessContextIsGenerating,
	businessContextSettingsSchema,
	businessContextSourceUrlsSchema,
} from "@databuddy/shared/organization-business-context";
import { AsyncIteratorClass, eventIterator, ORPCError } from "@orpc/server";
import { z } from "zod";
import { rpcError } from "../errors";
import { setAuditOrganization } from "../lib/audit";
import {
	businessContextGenerationAccess,
	businessContextGenerationAccessSchema,
} from "../lib/business-context-access";
import { runAuditedMutation } from "../middleware/audit-mutation";
import { protectedProcedure, sessionProcedure, type Context } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const scope = z.object({ organizationId: z.string().min(1).max(256) }).strict();

async function requireEditor(context: Context, organizationId: string) {
	// Resolve a readable organization before attributing a denied write to it.
	await withWorkspace(context, {
		organizationId,
		resource: "organization",
		permissions: ["read"],
	});
	setAuditOrganization(context, organizationId);
	return await withWorkspace(context, {
		organizationId,
		resource: "organization",
		permissions: ["update"],
	});
}

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
	generationAccess: protectedProcedure
		.route({
			method: "POST",
			path: "/business-context/generation-access",
			summary: "Check access to generate a business context draft",
			tags: ["Organizations"],
		})
		.input(scope)
		.output(businessContextGenerationAccessSchema)
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["read"],
			});
			const current = await readOrganizationBusinessContext(
				input.organizationId
			).catch(contextError);
			return businessContextGenerationAccess(
				input.organizationId,
				workspace.role,
				current.profile !== null
			);
		}),
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
	save: sessionProcedure
		.route({
			method: "POST",
			path: "/business-context/save",
			summary: "Save business context",
			tags: ["Organizations"],
		})
		.input(scope.extend(businessContextEditSchema.shape))
		.output(businessContextSettingsSchema)
		.handler(({ context, input }) =>
			runAuditedMutation("businessContext.save", context, async () => {
				await requireEditor(context, input.organizationId);
				await saveOrganizationBusinessProfile({
					...input,
					updatedBy: context.user.id,
				}).catch(contextError);
				return settings(context, input.organizationId);
			})
		),
	cancel: protectedProcedure
		.route({
			method: "POST",
			path: "/business-context/cancel",
			summary: "Cancel or discard an AI business context draft",
			tags: ["Organizations"],
		})
		.input(scope.extend({ generationId: z.uuid() }))
		.output(businessContextSettingsSchema)
		.handler(({ context, input }) =>
			runAuditedMutation("businessContext.cancel", context, async () => {
				await requireEditor(context, input.organizationId);
				await cancelBusinessContextGeneration(input).catch(contextError);
				return settings(context, input.organizationId);
			})
		),
	restore: sessionProcedure
		.route({
			method: "POST",
			path: "/business-context/restore",
			summary: "Restore a saved business context version",
			tags: ["Organizations"],
		})
		.input(
			scope.extend({
				revision: z.number().int().positive(),
				restoreRevision: z.number().int().positive(),
			})
		)
		.output(businessContextSettingsSchema)
		.handler(({ context, input }) =>
			runAuditedMutation("businessContext.restore", context, async () => {
				await requireEditor(context, input.organizationId);
				await restoreOrganizationBusinessProfile({
					...input,
					updatedBy: context.user.id,
				}).catch(contextError);
				return settings(context, input.organizationId);
			})
		),
	generate: sessionProcedure
		.route({
			method: "POST",
			path: "/business-context/generate",
			summary: "Stream a business context draft from a website",
			tags: ["Organizations"],
		})
		.input(
			scope.extend({
				websiteId: z.string().min(1).max(256),
				sourceUrls: businessContextSourceUrlsSchema.optional(),
			})
		)
		.output(eventIterator(businessContextSettingsSchema))
		.handler(({ context, input, signal: requestSignal }) =>
			// Audit admission; the generator records its eventual completion or failure.
			runAuditedMutation("businessContext.generate", context, async () => {
				const workspace = await requireEditor(context, input.organizationId);
				const generate = context.generateBusinessContext;
				if (!generate) {
					throw rpcError.serviceUnavailable(
						5,
						"Business context generation is unavailable. Try again shortly."
					);
				}
				const current = await settings(context, input.organizationId);
				if (businessContextIsGenerating(current)) {
					throw new ORPCError("CONFLICT", {
						message:
							"A business context generation is already running. Stop it before starting another.",
					});
				}
				const access = await businessContextGenerationAccess(
					input.organizationId,
					workspace.role,
					current.profile !== null
				);
				if (access.status === "credits-required") {
					throw new ORPCError("PAYMENT_REQUIRED", { message: access.message });
				}
				if (access.status === "read-only") {
					throw new ORPCError("FORBIDDEN", { message: access.message });
				}
				if (access.status !== "allowed") {
					throw rpcError.serviceUnavailable(5, access.message);
				}
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
				requestSignal?.throwIfAborted();
				const state = await beginBusinessContextGeneration({
					...input,
					requestedBy: context.user.id,
				}).catch(contextError);
				const generation = state.generation;
				if (!generation) {
					throw rpcError.internal(
						"Could not start business context generation. Try again."
					);
				}
				const controller = new AbortController();
				const signal = requestSignal
					? AbortSignal.any([requestSignal, controller.signal])
					: controller.signal;
				const iterator = (async function* () {
					signal.throwIfAborted();
					yield { ...current, ...state };
					for await (const update of generate({
						organizationId: input.organizationId,
						generationId: generation.id,
						signal,
					})) {
						yield { ...current, ...update };
					}
				})();
				return new AsyncIteratorClass(
					() => iterator.next(),
					async () => {
						controller.abort();
						try {
							await iterator.return();
						} finally {
							await cancelBusinessContextGeneration({
								organizationId: input.organizationId,
								generationId: generation.id,
								activeOnly: true,
							}).catch(contextError);
						}
					}
				);
			})
		),
};
