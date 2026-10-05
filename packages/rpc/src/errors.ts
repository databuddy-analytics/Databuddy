import { ORPCError } from "@orpc/server";
import { z } from "zod";

const resourceSchema = z.object({
	resourceType: z.string(),
	resourceId: z.string().optional(),
});

const limitSchema = z.object({
	feature: z.string(),
	limit: z.number(),
	current: z.number(),
	nextPlan: z.string().optional(),
});

const featureSchema = z.object({
	feature: z.string(),
	requiredPlan: z.string().optional(),
});

const retrySchema = z.object({
	retryAfter: z.number().int().min(1),
});

export const baseErrors = {
	UNAUTHORIZED: {
		message: "Sign in to continue.",
		status: 401,
	},
	FORBIDDEN: {
		message:
			"You do not have permission to do this. Ask an owner or admin of your organization for access.",
		status: 403,
	},
	NOT_FOUND: {
		message: "This item was not found. It may have been deleted.",
		status: 404,
		data: resourceSchema.optional(),
	},
	CONFLICT: {
		message: "Something with this name already exists. Pick a different one.",
		status: 409,
		data: resourceSchema.optional(),
	},
	BAD_REQUEST: {
		message: "Some of the details are invalid. Check them and try again.",
		status: 400,
	},
	RATE_LIMITED: {
		message: "Too many requests. Try again shortly.",
		status: 429,
		data: retrySchema,
	},
	SERVICE_UNAVAILABLE: {
		message: "This service is temporarily unavailable. Try again in a moment.",
		status: 503,
		data: retrySchema,
	},
	PLAN_LIMIT_EXCEEDED: {
		message: "You have reached the limit on your plan. Upgrade to add more.",
		status: 402,
		data: limitSchema,
	},
	FEATURE_UNAVAILABLE: {
		message: "This feature is not included in your plan. Upgrade to use it.",
		status: 402,
		data: featureSchema,
	},
	INTERNAL_SERVER_ERROR: {
		message: "Something went wrong on our side. Try again in a moment.",
		status: 500,
	},
} as const;

export const rpcError = {
	unauthorized: (message?: string) =>
		new ORPCError("UNAUTHORIZED", { message }),
	forbidden: (message?: string) => new ORPCError("FORBIDDEN", { message }),
	notFound: (resourceType: string, resourceId?: string) =>
		new ORPCError("NOT_FOUND", {
			message: `${humanizeResourceType(resourceType)} not found. It may have been deleted.`,
			data: { resourceType, resourceId },
		}),
	badRequest: (message?: string) => new ORPCError("BAD_REQUEST", { message }),
	featureUnavailable: (
		feature: string,
		requiredPlan?: string,
		message?: string
	) =>
		new ORPCError("FEATURE_UNAVAILABLE", {
			status: 402,
			message:
				message ??
				"This feature is not included in your plan. Upgrade to use it.",
			data: { feature, requiredPlan },
		}),
	conflict: (message?: string) => new ORPCError("CONFLICT", { message }),
	rateLimited: (retryAfter = 60) =>
		new ORPCError("RATE_LIMITED", {
			status: 429,
			message: "Too many requests. Try again shortly.",
			data: { retryAfter: normalizeRetryAfterSeconds(retryAfter) },
		}),
	serviceUnavailable: (retryAfter = 1, message?: string) =>
		new ORPCError("SERVICE_UNAVAILABLE", {
			status: 503,
			message:
				message ??
				"This service is temporarily unavailable. Try again in a moment.",
			data: { retryAfter: normalizeRetryAfterSeconds(retryAfter) },
		}),
	planLimitExceeded: ({
		message,
		...data
	}: {
		feature: string;
		limit: number;
		current: number;
		nextPlan?: string;
		message: string;
	}) =>
		new ORPCError("PLAN_LIMIT_EXCEEDED", {
			status: 402,
			message,
			data,
		}),
	internal: (message?: string) =>
		new ORPCError("INTERNAL_SERVER_ERROR", { message }),
};

const RESOURCE_NOUNS: Record<string, string> = {
	"agent chat": "Conversation",
	"import run": "Import",
	"investigation reply": "Reply",
	"link folder": "Folder",
	"revenue config": "Revenue settings",
	flag: "Feature flag",
	schedule: "Monitor",
	statuspage: "Status page",
	statuspagemonitor: "Monitor on this status page",
	uptimeschedule: "Monitor",
};

const CAMEL_CASE_BOUNDARY = /([a-z])([A-Z])/g;

function humanizeResourceType(resourceType: string): string {
	const mapped = RESOURCE_NOUNS[resourceType.toLowerCase()];
	if (mapped) {
		return mapped;
	}
	const spaced = resourceType.replace(
		CAMEL_CASE_BOUNDARY,
		(_, before: string, after: string) => `${before} ${after.toLowerCase()}`
	);
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function normalizeRetryAfterSeconds(value: number): number {
	if (!Number.isFinite(value)) {
		return 60;
	}
	if (value > 1_000_000_000) {
		return Math.max(1, Math.ceil((value - Date.now()) / 1000));
	}
	return Math.max(1, Math.ceil(value));
}
