import { desc, eq, ssoProvider } from "@databuddy/db";
import { z } from "zod";
import { protectedProcedure } from "../orpc";

export const ssoRouter = {
	list: protectedProcedure
		.input(z.object({ organizationId: z.string() }))
		.handler(async ({ context, input }) => {
			const providers = await context.db
				.select()
				.from(ssoProvider)
				.where(eq(ssoProvider.organizationId, input.organizationId))
				.orderBy(desc(ssoProvider.id));

			return providers.map((p) => ({
				id: p.id,
				providerId: p.providerId,
				issuer: p.issuer,
				domain: p.domain,
				organizationId: p.organizationId,
				userId: p.userId,
				oidcConfig: p.oidcConfig,
				samlConfig: p.samlConfig,
			}));
		}),

	getById: protectedProcedure
		.input(z.object({ providerId: z.string() }))
		.handler(async ({ context, input }) => {
			const provider = await context.db.query.ssoProvider.findFirst({
				where: eq(ssoProvider.providerId, input.providerId),
			});

			if (!provider) {
				return null;
			}

			return {
				id: provider.id,
				providerId: provider.providerId,
				issuer: provider.issuer,
				domain: provider.domain,
				organizationId: provider.organizationId,
				userId: provider.userId,
				oidcConfig: provider.oidcConfig,
				samlConfig: provider.samlConfig,
			};
		}),

	delete: protectedProcedure
		.input(z.object({ providerId: z.string() }))
		.handler(async ({ context, input }) => {
			await context.db
				.delete(ssoProvider)
				.where(eq(ssoProvider.providerId, input.providerId));

			return { success: true };
		}),
};
