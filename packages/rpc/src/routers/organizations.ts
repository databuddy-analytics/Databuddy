import { websitesApi } from '@databuddy/auth';
import { db, organization } from '@databuddy/db';
import { uploadOrganizationLogoSchema } from '@databuddy/validation';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { s3 } from '../utils/s3';

export const organizationsRouter = createTRPCRouter({
	uploadLogo: protectedProcedure
		.input(
			uploadOrganizationLogoSchema.extend({
				fileData: z.string().min(1, 'File data is required'),
				fileName: z.string().min(1, 'File name is required'),
				fileType: z.string().min(1, 'File type is required'),
			})
		)
		.mutation(async ({ input, ctx }) => {
			// Check if user has permission to manage logo for this organization
			const { success } = await websitesApi.hasPermission({
				headers: ctx.headers,
				body: { permissions: { organization: ['manage_logo'] } },
			});
			if (!success) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message:
						'You do not have permission to manage this organization logo.',
				});
			}

			// Get organization
			const [org] = await db
				.select()
				.from(organization)
				.where(eq(organization.id, input.organizationId))
				.limit(1);

			if (!org) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Organization not found.',
				});
			}

			try {
				// Delete old logo if it exists
				if (org.logo) {
					await s3.deleteOrganizationLogo(org.logo);
				}

				const base64Data = input.fileData.split(',')[1];
				const buffer = Buffer.from(base64Data, 'base64');
				const file = new File([buffer], input.fileName, {
					type: input.fileType,
				});

				const logoUrl = await s3.uploadOrganizationLogo(
					input.organizationId,
					file
				);

				// Update organization with new logo URL
				const [updatedOrganization] = await db
					.update(organization)
					.set({ logo: logoUrl })
					.where(eq(organization.id, input.organizationId))
					.returning();

				return {
					organization: updatedOrganization,
					logoUrl,
				};
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to upload organization logo',
					cause: error,
				});
			}
		}),

	deleteLogo: protectedProcedure
		.input(uploadOrganizationLogoSchema)
		.mutation(async ({ input, ctx }) => {
			// Check if user has permission to manage logo for this organization
			const { success } = await websitesApi.hasPermission({
				headers: ctx.headers,
				body: { permissions: { organization: ['manage_logo'] } },
			});
			if (!success) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message:
						'You do not have permission to manage this organization logo.',
				});
			}

			// Get organization
			const [org] = await db
				.select()
				.from(organization)
				.where(eq(organization.id, input.organizationId))
				.limit(1);

			if (!org) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Organization not found.',
				});
			}

			try {
				// Delete logo if it exists
				if (org.logo) {
					await s3.deleteOrganizationLogo(org.logo);
				}

				// Remove logo URL from database
				const [updatedOrganization] = await db
					.update(organization)
					.set({ logo: null })
					.where(eq(organization.id, input.organizationId))
					.returning();

				return {
					organization: updatedOrganization,
					success: true,
				};
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to delete organization logo',
					cause: error,
				});
			}
		}),
});
