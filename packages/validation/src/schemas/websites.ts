import z from "zod";
import { DOMAIN_REGEX, SUBDOMAIN_REGEX, WEBSITE_NAME_REGEX } from "../regexes";

export const websiteNameSchema = z
	.string()
	.min(1)
	.max(100)
	.regex(WEBSITE_NAME_REGEX, "Invalid website name format");

export const domainSchema = z.preprocess(
	(val) => {
		if (typeof val !== "string") {
			return val;
		}
		let domain = val.trim();
		if (domain.startsWith("http://") || domain.startsWith("https://")) {
			try {
				domain = new URL(domain).hostname;
			} catch {
				// Do nothing
			}
		}
		return domain;
	},
	z.string().min(1).max(253).regex(DOMAIN_REGEX, "Invalid domain format")
);

export const subdomainSchema = z
	.string()
	.max(63)
	.regex(SUBDOMAIN_REGEX, "Invalid subdomain format")
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
	domain: domainSchema.optional(),
});

export const togglePublicWebsiteSchema = z.object({
	id: z.string(),
	isPublic: z.boolean(),
});

export const transferWebsiteSchema = z.object({
	websiteId: z.string(),
	organizationId: z.string().optional(),
});

export const transferWebsiteToOrgSchema = z.object({
	websiteId: z.string(),
	targetOrganizationId: z.string(),
});

const ipv4Regex =
	/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
const cidrRegex =
	/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;

const originSchema = z
	.string()
	.min(1)
	.refine(
		(val) => {
			if (val === "*") {
				return true;
			}
			if (val === "localhost") {
				return true;
			}
			if (val.startsWith("*.")) {
				const domain = val.slice(2);
				return DOMAIN_REGEX.test(domain);
			}
			// Regular domain: example.com or subdomain.example.com
			return DOMAIN_REGEX.test(val);
		},
		{ message: "Must be a valid domain (e.g., cal.com, *.cal.com) or *" }
	);

const ipSchema = z.string().refine(
	(val) => {
		return ipv4Regex.test(val) || ipv6Regex.test(val) || cidrRegex.test(val);
	},
	{ message: "Must be a valid IPv4, IPv6, or CIDR notation" }
);

export const updateWebsiteSettingsSchema = z.object({
	id: z.string(),
	settings: z
		.object({
			allowedOrigins: z.array(originSchema).optional(),
			allowedIps: z.array(ipSchema).optional(),
		})
		.partial()
		.optional(),
});
