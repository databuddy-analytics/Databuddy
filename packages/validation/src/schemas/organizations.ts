import z from 'zod';

export const organizationNameSchema = z
	.string()
	.min(1, 'Organization name is required')
	.max(100, 'Organization name must be less than 100 characters')
	.trim();

export const organizationSlugSchema = z
	.string()
	.min(1, 'Organization slug is required')
	.max(50, 'Organization slug must be less than 50 characters')
	.regex(
		/^[a-z0-9-]+$/,
		'Slug can only contain lowercase letters, numbers, and hyphens'
	)
	.trim();

export const organizationLogoSchema = z
	.string()
	.url('Logo must be a valid URL')
	.optional();

export const createOrganizationSchema = z.object({
	name: organizationNameSchema,
	slug: organizationSlugSchema.optional(),
	logo: organizationLogoSchema,
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateOrganizationSchema = z.object({
	id: z.string().min(1, 'Organization ID is required'),
	name: organizationNameSchema.optional(),
	slug: organizationSlugSchema.optional(),
	logo: organizationLogoSchema,
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const uploadOrganizationLogoSchema = z.object({
	organizationId: z.string().min(1, 'Organization ID is required'),
});

export const deleteOrganizationSchema = z.object({
	id: z.string().min(1, 'Organization ID is required'),
});
