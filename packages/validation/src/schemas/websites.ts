import z from 'zod/v4';
import { DOMAIN_REGEX, SUBDOMAIN_REGEX, WEBSITE_NAME_REGEX } from '../regexes';

export const websiteNameSchema = z
	.string()
	.min(1)
	.max(100)
	.regex(WEBSITE_NAME_REGEX, 'Invalid website name format');

export const domainSchema = z.preprocess(
	(val) => {
		if (typeof val !== 'string') {
			return val;
		}
		let domain = val.trim();
		if (domain.startsWith('http://') || domain.startsWith('https://')) {
			try {
				domain = new URL(domain).hostname;
			} catch {
				// Do nothing
			}
		}
		return domain;
	},
	z.string().min(1).max(253).regex(DOMAIN_REGEX, 'Invalid domain format')
);

export const subdomainSchema = z
	.string()
	.max(63)
	.regex(SUBDOMAIN_REGEX, 'Invalid subdomain format')
	.optional();

export const createWebsiteSchema = z.object({
	name: websiteNameSchema,
	domain: domainSchema,
	subdomain: subdomainSchema,
	organizationId: z.string().optional(),
});

export const updateWebsiteSchema = z.object({
	id: z.string(),
	name: websiteNameSchema,
	isPublic: z.boolean().optional(),
});

export const transferWebsiteSchema = z.object({
	websiteId: z.string(),
	organizationId: z.string().optional(),
});
